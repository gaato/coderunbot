import {
  type BaseMessageOptions,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  Message,
  type MessageEditOptions,
  MessageFlags,
  type MessageReplyOptions,
} from "discord.js";
import { LimitedSizeMap } from "../../shared/limitedMap.js";
import type { FeatureId, OutgoingReply } from "../../types.js";
import { deleteButtonRow } from "./components.js";
import type { ReplyTarget } from "./context.js";
import { cancelPaginator } from "./paginator.js";

export interface EditableReply {
  edit(options: MessageEditOptions): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface ReplyPayload {
  readonly kind: OutgoingReply["kind"];
  readonly content?: string;
  readonly components: NonNullable<BaseMessageOptions["components"]>;
  readonly files?: BaseMessageOptions["files"];
  readonly ephemeral: boolean;
  readonly replaceAttachments: boolean;
}

export interface ReplyTransport {
  send(target: ReplyTarget, payload: ReplyPayload): Promise<EditableReply>;
  edit(reply: EditableReply, payload: ReplyPayload): Promise<void>;
  delete(reply: EditableReply): Promise<void>;
}

function messageFlags(payload: ReplyPayload): number | undefined {
  let flags =
    payload.kind === "components-v2" ? MessageFlags.IsComponentsV2 : 0;
  if (payload.ephemeral) {
    flags |= MessageFlags.Ephemeral;
  }
  return flags === 0 ? undefined : flags;
}

function editFlags(
  payload: ReplyPayload,
): MessageFlags.IsComponentsV2 | undefined {
  return payload.kind === "components-v2"
    ? MessageFlags.IsComponentsV2
    : undefined;
}

const discordReplyTransport: ReplyTransport = {
  async send(target, payload) {
    if (target instanceof Message) {
      const options: MessageReplyOptions = {
        content: payload.content,
        components: payload.components,
        files: payload.files,
        flags:
          payload.kind === "components-v2"
            ? MessageFlags.IsComponentsV2
            : undefined,
      };
      return target.reply(options);
    }

    if (target.deferred || target.replied) {
      const options: InteractionEditReplyOptions = {
        content: payload.content,
        components: payload.components,
        files: payload.files,
        attachments: payload.replaceAttachments ? [] : undefined,
        flags: editFlags(payload),
      };
      await target.editReply(options);
      return target.fetchReply();
    }

    const options: InteractionReplyOptions = {
      content: payload.content,
      components: payload.components,
      files: payload.files,
      flags: messageFlags(payload),
    };
    await target.reply(options);
    return target.fetchReply();
  },

  async edit(reply, payload) {
    const options: MessageEditOptions = {
      content: payload.content ?? null,
      components: payload.components,
      files: payload.files,
      attachments: [],
      flags: editFlags(payload),
    };
    await reply.edit(options);
  },

  async delete(reply) {
    await reply.delete();
  },
};

interface ReplyState {
  readonly generation: number;
  readonly reply?: EditableReply;
  readonly kind?: OutgoingReply["kind"];
}

export interface DeliveryRequest {
  readonly featureId: FeatureId;
  readonly target: ReplyTarget;
  readonly userId: string;
  readonly outgoing: OutgoingReply;
  readonly sourceMessageId?: string;
  readonly generation?: number;
}

export type DeliveryResult = "sent" | "edited" | "stale";

export class ReplyCoordinator {
  readonly #capacity: number;
  readonly #transport: ReplyTransport;
  readonly #trackers = new Map<FeatureId, LimitedSizeMap<string, ReplyState>>();

  constructor(
    capacity = 100,
    transport: ReplyTransport = discordReplyTransport,
  ) {
    this.#capacity = capacity;
    this.#transport = transport;
  }

  begin(featureId: FeatureId, sourceMessageId: string): number {
    const tracker = this.#tracker(featureId);
    const current = tracker.get(sourceMessageId);
    const generation = (current?.generation ?? 0) + 1;
    tracker.set(sourceMessageId, { ...current, generation });
    return generation;
  }

  isTracked(featureId: FeatureId, sourceMessageId: string): boolean {
    return this.#trackers.get(featureId)?.has(sourceMessageId) ?? false;
  }

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    const payload = this.#payload(request.outgoing, request.userId);
    if (
      request.sourceMessageId === undefined ||
      request.generation === undefined
    ) {
      const reply = await this.#transport.send(request.target, payload);
      await this.#afterDelivery(request.outgoing, reply);
      return "sent";
    }

    const sourceMessageId = request.sourceMessageId;
    const generation = request.generation;
    const tracker = this.#tracker(request.featureId);
    const state = tracker.get(sourceMessageId);
    if (state?.generation !== generation) {
      return "stale";
    }

    if (state.reply !== undefined) {
      if (state.kind !== request.outgoing.kind) {
        throw new Error(
          `tracked reply kind cannot change from ${state.kind} to ${request.outgoing.kind}`,
        );
      }
      await this.#transport.edit(state.reply, payload);
      await this.#afterDelivery(request.outgoing, state.reply);
      return "edited";
    }

    const reply = await this.#transport.send(request.target, payload);
    const latest = tracker.get(sourceMessageId);
    if (latest?.generation !== generation) {
      await this.#transport.delete(reply);
      return "stale";
    }

    tracker.set(sourceMessageId, {
      generation: latest.generation,
      reply,
      kind: request.outgoing.kind,
    });
    await this.#afterDelivery(request.outgoing, reply);
    return "sent";
  }

  async deleteReplies(sourceMessageId: string): Promise<void> {
    const deletions: Promise<void>[] = [];
    for (const tracker of this.#trackers.values()) {
      const state = tracker.get(sourceMessageId);
      tracker.delete(sourceMessageId);
      if (state?.reply !== undefined) {
        deletions.push(this.#transport.delete(state.reply));
      }
    }
    await Promise.allSettled(deletions);
  }

  #tracker(featureId: FeatureId): LimitedSizeMap<string, ReplyState> {
    let tracker = this.#trackers.get(featureId);
    if (tracker === undefined) {
      tracker = new LimitedSizeMap(this.#capacity);
      this.#trackers.set(featureId, tracker);
    }
    return tracker;
  }

  #payload(outgoing: OutgoingReply, userId: string): ReplyPayload {
    // Ephemeral replies cannot be deleted via message.delete(); Discord
    // provides its own dismiss affordance, so no delete button there.
    const deleteRow = outgoing.ephemeral ? [] : [deleteButtonRow(userId)];
    const components =
      outgoing.kind === "components-v2"
        ? [...outgoing.components, ...deleteRow]
        : deleteRow;

    return {
      kind: outgoing.kind,
      content: outgoing.kind === "plain" ? outgoing.content : undefined,
      components,
      files: outgoing.files,
      ephemeral: outgoing.ephemeral ?? false,
      replaceAttachments: true,
    };
  }

  async #afterDelivery(
    outgoing: OutgoingReply,
    reply: EditableReply,
  ): Promise<void> {
    if (reply instanceof Message) {
      cancelPaginator(reply);
      await outgoing.onDelivered?.(reply);
    }
  }
}
