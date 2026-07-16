///|
priv struct WorkerRequest {
  id : Int
  latex : String
} derive(ToJson)

///|
pub(all) struct WorkerResponse {
  id : Int
  ok : Bool
  png : String?
  error : String?
} derive(FromJson, Debug, Eq)

///|
pub fn encode_request(id : Int, latex : String) -> String {
  ToJson::to_json(WorkerRequest::{ id, latex }).stringify()
}

///|
pub fn decode_response(value : String) -> WorkerResponse raise {
  @json.from_json(@json.parse(value))
}
