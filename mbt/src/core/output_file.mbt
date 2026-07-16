///|
pub(all) struct OutputFile {
  name : String
  content : Bytes
  spoiler : Bool
} derive(Debug)

///|
pub fn OutputFile::to_upload(self : OutputFile) -> @dhttp.FileUpload {
  FileUpload(self.name, self.content, is_spoiler=self.spoiler)
}
