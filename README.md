# Split Large Messages for Vencord

> [!TIP]
> Get rid of discord's character limits, but in a ToS friendly way!

When you try to send a message that exceeds discord's limits, this plugin will split it up into multiple messages.

### How it works
The plugin intercepts the message, splits it into chunks, and allows the first chunk to be sent through the users initial action. It then waits for a configurable delay before automatically prefilling the chat input box with the next chunk. The user then has to manually hit `Enter` to send each subsequent chunk. Also works with codeblocks.

![](https://github.com/user-attachments/assets/80435572-302c-4780-ab81-16df3e449f97)
_Counter to indicate the split count._

> [!WARNING]  
> Completely disables discord's `convert to txt-file` feature (which isn't useful anyway).

### Installation:
Follow [this guide](https://discord.com/channels/1015060230222131221/1257038407503446176) on the official [vencord discord server](https://discord.gg/vencord).

### Settings:
![](https://github.com/user-attachments/assets/44d25510-ea36-4a3f-9043-68c930382e02)

### Compatibility
Fully compatible with all tested official plugins, explicitly with [CharacterCounter](https://vencord.dev/plugins/CharacterCounter):
![](https://github.com/user-attachments/assets/a9e8f175-64a1-48bc-87d5-efdbac6da1dd)

### Credits:
Text splitting and codeblock repair logic are based on a js implementation by [Mirco  Wittrien](https://github.com/mwittrien).