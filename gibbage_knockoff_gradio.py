import gradio as gr
import random



def generateRandomCode():
    characters_to_use = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = ""
    for _ in range(4):
        code += characters_to_use[random.randint(0, len(characters_to_use) - 1)]
    return code


class User:
    name = None
    def __init__(self, name):
        self.name = name

class Game:
    users = None
    def __init__(self):
        self.users = {}

    def add_user(self, user):
        self.users[user.name] = user

games = {}

def join_game(code, username):
    game = games.get(code)
    if not game:
        game = Game()
        games[code] = game
    user = User(username)
    game.add_user(user)

def leave_game(code, username):
    game = games.get(code)
    if not game:
        return
    game.users.pop(username)

def joined_users_markdown_string( game_code ):
    game = games.get(game_code)
    if not game:
        return "Game not found"
    return "## Joined Users\n".join([user.name for user in game.users.values()])

SERVER_TAB_JS_NAME = "server-tab"

# js = """
# () => {
#     console.log( "boo first thing" );
#     alert("boo1");
#     window.onload = () => {
#         alert("boo2");
#         // console.log( "Adding the boo thing here." );
#         // document.getElementById("join-button").addEventListener("click", (e) => {
#         //     alert("boo");
#         // });
#     };
#     alert("boo3");
# }
# """

js = """
() => {
    var found_join_button = document.getElementById("join-button");
    found_join_button.addEventListener("click", (e) => {
        document.getElementById('server-tab-button').click()
    });
    //alert( "Found join button: " + found_join_button );
    //console.log( "Found join button: " + found_join_button );
}
"""

#js = "() => alert( 'I am not a potato!' )"


with gr.Blocks( js=js ) as demo:
    with gr.Tabs() as tabs:

        with gr.TabItem("Server", elem_id=SERVER_TAB_JS_NAME) as server_tab:
            gr.Markdown( "## Server" )


            host_code_text = gr.Textbox(label="Host Code", value="<none>", interactive=False)

            joined_users = gr.Markdown("## Joined Users")
            new_code_btn = gr.Button("Generate New Code")


        def new_code_btn_click():
            return generateRandomCode()
        # pylint: disable=no-member
        new_code_btn.click(fn=new_code_btn_click, inputs=None, outputs=host_code_text)

        with gr.TabItem('Join') as join_tab:
            gr.Markdown( "## Join" )

            username_text = gr.Textbox(label="Username")
            join_code_text = gr.Textbox(label="Join Code")

            with gr.Row():
                join_btn = gr.Button("Join", elem_id="join-button")
                leave_btn = gr.Button("Leave")

    def join_btn_click( user_name, join_code):
        join_game(join_code, user_name)
        return join_code, joined_users_markdown_string( join_code )
    # pylint: disable=no-member
    #join_btn.click(fn=join_btn_click, inputs=[username_text, join_code_text], outputs=[host_code_text,joined_users], js="(h,j) => {\ndocument.getElementById('" + SERVER_TAB_JS_NAME + "-button').click();\nreturn [];\n}")
    join_btn.click(fn=join_btn_click, inputs=[username_text, join_code_text], outputs=[host_code_text,joined_users])

    def leave_btn_click( user_name, join_code):
        leave_game(join_code, user_name)
    # pylint: disable=no-member
    leave_btn.click(fn=leave_btn_click, inputs=[username_text, join_code_text], outputs=None)



    poll_btn = gr.Button("Poll")
    def poll_btn_click( host_code ):
        if host_code == "<none>":
            host_code = generateRandomCode()
        return joined_users_markdown_string(host_code), host_code
    # pylint: disable=no-member
    poll_btn.click(fn=poll_btn_click, inputs=[host_code_text], outputs=[joined_users,host_code_text])




if __name__ == '__main__':
    demo.launch(show_api=False,show_error=True)