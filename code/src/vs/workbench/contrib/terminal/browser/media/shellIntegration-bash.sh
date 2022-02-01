
if [ -z "$VSCODE_SHELL_LOGIN" ]; then
    . ~/.bashrc
else
    # Imitate -l because --init-file doesn't support it:
    # run the first of these files that exists
    if [ -f ~/.bash_profile ]; then
        . ~/.bash_profile
    elif [ -f ~/.bash_login ]; then
        . ~/.bash_login
    elif [ -f ~/.profile ]; then
        . ~/.profile
    fi
    VSCODE_SHELL_LOGIN=""
fi

IN_COMMAND_EXECUTION="1"
prompt_start() {
    printf "\033]133;A\007"
}

prompt_end() {
    printf "\033]133;B\007"
}

update_cwd() {
    printf "\033]1337;CurrentDir=%s\007" "$PWD"
}

command_output_start() {
    printf "\033]133;C\007"
}

command_complete() {
    printf "\033]133;D;%s\007" "$STATUS"
    update_cwd
}

update_prompt() {
    PRIOR_PROMPT="$PS1"
    IN_COMMAND_EXECUTION=""
    PS1="$(prompt_start)$PREFIX$PS1$(prompt_end)"
}

precmd() {
    local STATUS="$?"
    command_complete "$STATUS"

    # in command execution
    if [ -n "$IN_COMMAND_EXECUTION" ]; then
        # non null
        update_prompt
    fi
}
preexec() {
    PS1="$PRIOR_PROMPT"
    if [ -z "${IN_COMMAND_EXECUTION-}" ]; then
        IN_COMMAND_EXECUTION="1"
        command_output_start
    fi
}

update_prompt
export ORIGINAL_PROMPT_COMMAND=$PROMPT_COMMAND

prompt_cmd() {
    precmd
}
original_prompt_cmd() {
    ${ORIGINAL_PROMPT_COMMAND}
    prompt_cmd
}
if [ -n "$ORIGINAL_PROMPT_COMMAND" ]; then
    export PROMPT_COMMAND=original_prompt_cmd
else
    export PROMPT_COMMAND=prompt_cmd
fi

trap 'preexec' DEBUG
echo -e "\033[1;32mShell integration activated!\033[0m"
