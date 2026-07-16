///|
pub fn delete_custom_id(user_id : UInt64) -> String {
  "\{DELETE_PREFIX}\{user_id}"
}

///|
pub fn delete_authorized(custom_id : StringView, user_id : UInt64) -> Bool {
  custom_id == delete_custom_id(user_id)
}

///|
pub fn delete_row(user_id : UInt64) -> @model.Component {
  @discord.action_row([
    @discord.button(
      custom_id=delete_custom_id(user_id),
      label="Delete",
      style=Danger,
    ),
  ])
}

///|
pub fn install_delete_handler(app : @discord.App) -> Unit {
  app.on_component(
    prefix=DELETE_PREFIX,
    DeferredUpdate(ctx => {
      if delete_authorized(ctx.custom_id(), ctx.user().id.value()) {
        ctx.app().http().ref_of_message(ctx.message()).delete()
      }
    }),
  )
}
