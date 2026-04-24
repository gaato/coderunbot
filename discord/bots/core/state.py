import os
import pathlib

import oci
from oci.exceptions import ServiceError


class TextState:
    def __init__(self, local_path: pathlib.Path, object_name: str) -> None:
        self.local_path = local_path
        self.object_name = object_name
        self.backend = os.environ.get("BOT_STATE_BACKEND", "local")
        self.bucket = os.environ.get("BOT_STATE_BUCKET")
        self.namespace = os.environ.get("BOT_STATE_NAMESPACE")
        self.prefix = os.environ.get("BOT_STATE_PREFIX", "").strip("/")
        self._client = None

    @property
    def key(self) -> str:
        if self.prefix:
            return f"{self.prefix}/{self.object_name}"
        return self.object_name

    @property
    def client(self):
        if self._client is None:
            self._client = oci.object_storage.ObjectStorageClient(self._oci_config())
        return self._client

    def _oci_config(self) -> dict[str, str]:
        key_content = os.environ.get("OCI_PRIVATE_KEY")
        if key_content:
            return {
                "user": os.environ["OCI_USER_OCID"],
                "fingerprint": os.environ["OCI_FINGERPRINT"],
                "tenancy": os.environ["OCI_TENANCY_OCID"],
                "region": os.environ["OCI_REGION"],
                "key_content": key_content,
                **(
                    {"pass_phrase": os.environ["OCI_PRIVATE_KEY_PASSPHRASE"]}
                    if os.environ.get("OCI_PRIVATE_KEY_PASSPHRASE")
                    else {}
                ),
            }
        return oci.config.from_file()

    def read(self) -> str:
        if self.backend != "oci":
            return self._read_local()
        if not self.bucket or not self.namespace:
            raise RuntimeError(
                "BOT_STATE_BUCKET and BOT_STATE_NAMESPACE are required when BOT_STATE_BACKEND=oci"
            )
        try:
            response = self.client.get_object(self.namespace, self.bucket, self.key)
        except ServiceError as error:
            if error.status != 404:
                raise
            self.write("")
            return ""
        return response.data.content.decode("utf-8")

    def write(self, value: str) -> None:
        if self.backend != "oci":
            self._write_local(value)
            return
        if not self.bucket or not self.namespace:
            raise RuntimeError(
                "BOT_STATE_BUCKET and BOT_STATE_NAMESPACE are required when BOT_STATE_BACKEND=oci"
            )
        self.client.put_object(
            self.namespace,
            self.bucket,
            self.key,
            value.encode("utf-8"),
            content_type="text/plain; charset=utf-8",
        )

    def _read_local(self) -> str:
        if not self.local_path.exists():
            return ""
        return self.local_path.read_text()

    def _write_local(self, value: str) -> None:
        self.local_path.parent.mkdir(parents=True, exist_ok=True)
        self.local_path.write_text(value)


class OptOutUsers:
    def __init__(self, state: TextState) -> None:
        self.state = state
        self.users = self._parse(state.read())

    def __contains__(self, user_id: int) -> bool:
        return user_id in self.users

    def add(self, user_id: int) -> None:
        self.users.add(user_id)
        self.save()

    def remove(self, user_id: int) -> None:
        self.users.remove(user_id)
        self.save()

    def save(self) -> None:
        value = "".join(f"{user_id}\n" for user_id in sorted(self.users))
        self.state.write(value)

    @staticmethod
    def _parse(value: str) -> set[int]:
        return {int(line) for line in value.splitlines() if line.strip()}
