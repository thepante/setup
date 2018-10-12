fpath=($fpath "/home/pante/.zfunctions")

# Set Spaceship ZSH as a prompt
autoload -U promptinit; promptinit
prompt spaceship

# SPACESHIP_TIME_SHOW=true

HISTFILE=~/.zsh_history
HISTSIZE=100
SAVEHIST=500
HISTDUP=erase
setopt    appendhistory
setopt    sharehistory
setopt    incappendhistory

source $HOME/.aliases
source $(dirname $(gem which colorls))/tab_complete.sh
source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh
source ~/.zsh/zsh-interactive-cd.plugin.zsh
source ~/.zsh/shf.zsh

# source ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
# source ~/.zsh/auto_expand.zsh

bindkey "^[[1;5C" forward-word
bindkey "^[[1;5D" backward-word

# colored man - https://github.com/ael-code/zsh-colored-man-pages
function man() {
	env \
		LESS_TERMCAP_mb=$(printf "\e[1;34m") \
		LESS_TERMCAP_md=$(printf "\e[1;34m") \
		LESS_TERMCAP_me=$(printf "\e[0m") \
		LESS_TERMCAP_so=$(printf "\e[1;47;33m") \
		LESS_TERMCAP_se=$(printf "\e[0m") \
		LESS_TERMCAP_us=$(printf "\e[1;32m") \
		LESS_TERMCAP_ue=$(printf "\e[0m") \
		PAGER="${commands[less]:-$PAGER}" \
		man "$@"
}


[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
if [ $TILIX_ID ] || [ $VTE_VERSION ]; then
        source /etc/profile.d/vte.sh
fi
