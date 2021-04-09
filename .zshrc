fpath=($fpath "~/.zfunctions")

# Set Spaceship ZSH as a prompt
autoload -U promptinit; promptinit
prompt spaceship

# SPACESHIP_TIME_SHOW=true
SPACESHIP_PROMPT_PREFIXES_SHOW=false
SPACESHIP_NODE_SHOW=false
SPACESHIP_DIR_PREFIX=
SPACESHIP_DIR_LOCK_SYMBOL=" "
SPACESHIP_GIT_PREFIX=
SPACESHIP_GIT_STATUS_PREFIX=" "
SPACESHIP_GIT_STATUS_SUFFIX=""
SPACESHIP_GIT_BRANCH_PREFIX=" "
SPACESHIP_GIT_STATUS_MODIFIED=""
SPACESHIP_GIT_STATUS_UNTRACKED=""
SPACESHIP_GIT_STATUS_AHEAD=""
SPACESHIP_GIT_STATUS_BEHIND=""
SPACESHIP_VI_MODE_INSERT="I"
SPACESHIP_VI_MODE_NORMAL="N"
SPACESHIP_VI_MODE_COLOR="red"

HISTFILE=~/.zsh_history
HISTSIZE=800
SAVEHIST=800
HISTDUP=erase

# this was because that noglob issue
setopt NO_nomatch

setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_SAVE_NO_DUPS

setopt histignoredups
setopt nosharehistory
setopt noextendedhistory
setopt histfindnodups

setopt HIST_FIND_NO_DUPS

source $HOME/.aliases
source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh
source ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source ~/.zsh/shf.zsh
source ~/.zsh/k/k.sh

ZSH_HIGHLIGHT_STYLES[suffix-alias]=fg=002
ZSH_HIGHLIGHT_STYLES[precommand]=fg=002
ZSH_HIGHLIGHT_STYLES[arg0]=bold

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

# go lang:
export PATH=$PATH:/usr/local/go/bin

export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
export PATH=$PATH:$JAVA_HOME/bin

# add nvim to path
export PATH=/opt/nvim:$PATH
export VISUAL=nvim
export EDITOR=nvim

# Activate vim mode
source ~/.zsh/zsh-vim-mode/zsh-vim-mode.plugin.zsh
bindkey kj vi-cmd-mode

bindkey '^[^M' autosuggest-execute	# alt+enter
bindkey '^H' backward-kill-word     # ctrl+backspace

WORDCHARS='*?_-.[]~=&;!#$%^(){}<>'
KEYTIMEOUT=50

# Change cursor shape for different vi modes
MODE_CURSOR_VIINS="blinking bar"
MODE_CURSOR_REPLACE="$MODE_CURSOR_VIINS"
MODE_CURSOR_VICMD="blinking block"
MODE_CURSOR_SEARCH="steady underline"
MODE_CURSOR_VISUAL="wheat block"
MODE_CURSOR_VLINE="$MODE_CURSOR_VISUAL"

# Use vi navigation keys in menu completion
zstyle ':completion:*' menu select
zmodload zsh/complist

bindkey -M menuselect 'h' vi-backward-char
bindkey -M menuselect 'k' vi-up-line-or-history
bindkey -M menuselect 'l' vi-forward-char
bindkey -M menuselect 'j' vi-down-line-or-history

# FZF related
fzf_excluded="-E node_modules -E .git -E '*cache' -E '*go/pkg'"
export FZF_DEFAULT_OPTS='--ansi --multi'
export FZF_DEFAULT_COMMAND='fd -HLI -t f '$fzf_excluded
export FZF_DIRS_COMMAND='fd -HLI -t d '$fzf_excluded

open_with_fzf() {
  eval $FZF_DEFAULT_COMMAND | fzf -m --preview=bat | xargs -ro -d "\n" xdg-open 2>&-
}
cd_with_fzf() {
  cd ~ && cd "$(eval $FZF_DIRS_COMMAND | fzf)" && zle reset-prompt
}
zle -N open_with_fzf
zle -N cd_with_fzf

bindkey '^O' open_with_fzf
bindkey '^G' cd_with_fzf

