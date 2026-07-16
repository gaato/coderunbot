///|
pub fn embed(
  title? : String,
  description? : String,
  color? : Int,
  author_name? : String,
  image_url? : String,
  fields? : Array[@model.EmbedField],
) -> @model.Embed {
  {
    title,
    typ: None,
    url: None,
    description,
    timestamp: None,
    color,
    footer: None,
    image: image_url.map(url => {
      url,
      proxy_url: None,
      height: None,
      width: None,
    }),
    thumbnail: None,
    video: None,
    provider: None,
    author: author_name.map(name => {
      name,
      url: None,
      icon_url: None,
      proxy_icon_url: None,
    }),
    fields,
    flags: None,
  }
}

///|
pub fn add_embed_field(
  value : @model.Embed,
  name : String,
  field_value : String,
  inline? : Bool,
) -> @model.Embed {
  let fields = value.fields.unwrap_or([]).copy()
  fields.push({ name, value: field_value, inline })
  { ..value, fields: Some(fields) }
}
