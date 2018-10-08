fpath=($fpath "/home/pante/.zfunctions")

# Set Spaceship ZSH as a prompt
autoload -U promptinit; promptinit
prompt spaceship
  
source $HOME/.aliases
