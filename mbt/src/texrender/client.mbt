///|
pub(all) suberror TexWorkerError {
  NotReady
  EndOfFile
  Protocol(String)
  Render(String)
} derive(Debug)

///|
pub struct TexRenderer {
  priv worker_path_ : String
  priv timeout_ms_ : Int
  priv mutex_ : @async.Mutex
  priv mut writer_ : @process.WriteToProcess?
  priv mut reader_ : @process.ReadFromProcess?
  priv mut process_ : @process.Process?
  priv mut next_id_ : Int
}

///|
pub fn TexRenderer::TexRenderer(
  worker_path? : String,
  timeout_ms? : Int = 30000,
) -> TexRenderer {
  {
    worker_path_: worker_path.unwrap_or_else(() => {
      @env.get_env_var("TEX_WORKER_PATH").unwrap_or("./texworker/worker.js")
    }),
    timeout_ms_: timeout_ms,
    mutex_: Mutex(),
    writer_: None,
    reader_: None,
    process_: None,
    next_id_: 1,
  }
}

///|
fn TexRenderer::invalidate_locked(self : TexRenderer) -> Unit {
  if self.writer_ is Some(writer) {
    writer.close()
  }
  if self.reader_ is Some(reader) {
    reader.close()
  }
  if self.process_ is Some(process) {
    process.cancel()
  }
  self.writer_ = None
  self.reader_ = None
  self.process_ = None
}

///|
async fn TexRenderer::spawn_worker(
  self : TexRenderer,
  group : @async.TaskGroup[Unit],
) -> @process.Process {
  let (stdin, writer) = @process.write_to_process()
  let (reader, stdout) = @process.read_from_process()
  let process = @process.spawn(
    group,
    "node",
    [self.worker_path_],
    stdin~,
    stdout~,
    no_wait=true,
  ) catch {
    error => {
      writer.close()
      reader.close()
      raise error
    }
  }
  self.mutex_.acquire()
  self.invalidate_locked()
  self.writer_ = Some(writer)
  self.reader_ = Some(reader)
  self.process_ = Some(process)
  self.mutex_.release()
  println("[texworker] started pid \{process.pid}")
  process
}

///|
async fn TexRenderer::clear_process(self : TexRenderer, pid : Int) -> Unit {
  self.mutex_.acquire()
  defer self.mutex_.release()
  if self.process_ is Some(process) && process.pid == pid {
    self.invalidate_locked()
  }
}

///|
pub async fn TexRenderer::supervise(self : TexRenderer) -> Unit {
  @async.with_task_group(group => {
    for ;; {
      try {
        let process = self.spawn_worker(group)
        let status = process.wait()
        self.clear_process(process.pid)
        println(
          "[texworker] pid \{process.pid} exited with status \{status}; restarting",
        )
      } catch {
        error if @async.is_being_cancelled() ||
          @async.is_cancellation_error(error) => raise error
        error =>
          println("[texworker] start/supervision error: \{to_repr(error)}")
      }
      @async.sleep(250)
    }
  })
}

///|
pub async fn TexRenderer::render(self : TexRenderer, latex : String) -> Bytes {
  self.mutex_.acquire()
  defer self.mutex_.release()
  guard (self.writer_, self.reader_) is (Some(writer), Some(reader)) else {
    raise TexWorkerError::NotReady
  }
  let id = self.next_id_
  self.next_id_ += 1
  let line = "\{encode_request(id, latex)}\n"
  let response_line = @async.with_timeout(self.timeout_ms_, () => {
    writer.write(line)
    reader.read_until("\n")
  }) catch {
    error => {
      self.invalidate_locked()
      raise error
    }
  }
  match response_line {
    None => {
      self.invalidate_locked()
      raise TexWorkerError::EndOfFile
    }
    Some(response_line) => {
      let response = decode_response(response_line)
      if response.id != id {
        self.invalidate_locked()
        raise TexWorkerError::Protocol(
          "expected response id \{id}, got \{response.id}",
        )
      }
      if !response.ok {
        raise TexWorkerError::Render(
          response.error.unwrap_or("unknown rendering error"),
        )
      }
      guard response.png is Some(encoded) else {
        raise TexWorkerError::Protocol("successful response omitted png")
      }
      @base64.decode(encoded)
    }
  }
}
