fpath=($fpath "/home/pante/.zfunctions")

# Set Spaceship ZSH as a prompt
autoload -U promptinit; promptinit
prompt spaceship

HISTFILE=~/.zsh_history
HISTSIZE=100
SAVEHIST=500
HISTDUP=erase
setopt    appendhistory
setopt    sharehistory
setopt    incappendhistory

source $HOME/.aliases
source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh
# source ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
