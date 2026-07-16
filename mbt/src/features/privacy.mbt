///|
fn privacy_policy_command(policy : String) -> @discord.Command[Unit] {
  @discord.slash(
    name="privacy-policy",
    description="Show the privacy policy",
    args=@discord.Args::unit(),
    handler=Immediate((_, _) => @discord.CommandReply::message(content=policy)),
  )
}

///|
fn opt_out_command(users : @state.OptOutUsers) -> @discord.Command[Unit] {
  @discord.slash(
    name="opt-out",
    description="Opt out of message content tracking",
    args=@discord.Args::unit(),
    handler=Deferred(ephemeral=false, (ctx, _) => {
      let user_id = ctx.user().id.value()
      let message = if users.contains(user_id) {
        "Your message content is already off-track. To use other commands, please use the /opt-in command."
      } else {
        users.add(user_id)
        "This bot will not track your message content from now on. Most commands will no longer respond."
      }
      ctx.edit_original(content=message) |> ignore
    }),
  )
}

///|
fn opt_in_command(users : @state.OptOutUsers) -> @discord.Command[Unit] {
  @discord.slash(
    name="opt-in",
    description="Opt in to message content tracking",
    args=@discord.Args::unit(),
    handler=Deferred(ephemeral=false, (ctx, _) => {
      let user_id = ctx.user().id.value()
      let message = if users.contains(user_id) {
        users.remove(user_id)
        "This bot will now track the content of your messages. It will only be used to provide commands. Use the /privacy-policy command to view the privacy policy."
      } else {
        "This bot is already tracking your message content."
      }
      ctx.edit_original(content=message) |> ignore
    }),
  )
}

///|
pub fn install_privacy(
  app : @discord.App,
  users : @state.OptOutUsers,
  policy : String,
) -> Unit {
  app.command(privacy_policy_command(policy))
  app.command(opt_out_command(users))
  app.command(opt_in_command(users))
}
