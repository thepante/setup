set number
set numberwidth=1
set clipboard=unnamedplus
set showcmd
set ruler
set encoding=utf-8
set showmatch
set sw=2
set relativenumber
set laststatus=2
set cmdheight=2
set ignorecase
set noshowmode
set nowrap
set cursorline
set hidden
set splitbelow
set scrolloff=2
set noswapfile
set undofile
set tabstop=2
set expandtab
set updatetime=300
syntax enable

" Escape insert mode
inoremap kj <Esc>
cnoremap kj <C-c>

" Set leader
nnoremap <SPACE> <Nop>
let mapleader=" "

" Rename a symbol
nmap <leader>r <Plug>(coc-rename)

" Disable arrow keys
noremap <Up> <Nop>
noremap <Down> <Nop>
noremap <Left> <Nop>
noremap <Right> <Nop>

" Move on insert mode
:imap <C-h> <Left>
:imap <C-j> <Down>
:imap <C-k> <Up>
:imap <C-l> <Right>

" Insert empty line
nmap <C-k> O<Esc>j
nmap <C-j> o<Esc>k

" Insert spaces before/after cursor
nmap <C-h> i<space><Right><Esc>
nmap <C-l> a<space><Left><Esc>

" Undo changes since last save
nmap U :edit!<CR>

" Clear search using enter
noremap <CR> :noh<CR>

" Move lines
nnoremap <A-j> :m .+1<CR>==
nnoremap <A-k> :m .-2<CR>==
inoremap <A-j> <Esc>:m .+1<CR>==gi
inoremap <A-k> <Esc>:m .-2<CR>==gi
vnoremap <A-j> :m '>+1<CR>gv=gv
vnoremap <A-k> :m '<-2<CR>gv=gv

" Move between buffers
nnoremap <C-a> :bprev<CR>
nnoremap <C-d> :bnext<CR>

" Close buffer
nnoremap <C-w> :b#<bar>bd#<CR>

" Autoclose brackets
inoremap {      {}<Left>
inoremap {<CR>  {<CR>}<Esc>O
inoremap {}     {}
inoremap (      ()<Left>
inoremap <expr> )  strpart(getline('.'), col('.')-1, 1) == ")" ? "\<Right>" : ")"

" Comment toggle
nnoremap <C-_> :Commentary<CR>
vnoremap <C-_> :Commentary<CR>

" Cursor movement with easymotion
nmap t <Plug>(easymotion-s2)
nmap T <Plug>(easymotion-overwin-line)
nmap <leader>t <Plug>(easymotion-w)

" Swap ` and ' to go to line-column marks ('es' keyboard layout)
noremap ' `
sunmap '
noremap ` '
sunmap `
noremap g' g`
sunmap g'
noremap g` g'
sunmap g`

" Keep yank to paste
noremap <c-y> "ay
noremap <c-p> "ap

" Delete around block
nmap dao va{Vd

" Delete around block, including comments on top of it
nmap dab va{o{oVd

" Tab to go matching pair
map <Tab> %

" Format selected code
nmap <Leader>f :ClangFormat<CR>
vmap <Leader>f :ClangFormat<CR>

" Coc Rest-client request
noremap <Leader><CR> :CocCommand rest-client.request<CR>

" Open terminal
vnoremap <c-t> :split<CR>:ter<CR>:resize 15<CR>a
nnoremap <c-t> :split<CR>:ter<CR>:resize 15<CR>a

" Files explore
map <C-e> :NERDTreeToggle<CR>
map <A-e> :ProjectFiles<CR>
map <A-f> :FZF ~/<CR>
map <A-b> :BLines<CR>
map <A-.> :exe ":FZF " . expand("%:h")<CR>

imap <A-,> <
imap <A-.> >

" NERDTree autoclose on open file
let NERDTreeQuitOnOpen=1

" FZF window & preview
let g:fzf_layout = { 'down': '~20%' }
let g:fzf_preview_window = ['right:40%:hidden', 'ctrl-/']
let $FZF_DEFAULT_OPTS = '--margin=0,5'

" Move between splits
nmap <leader>k :wincmd k<CR>
nmap <leader>j :wincmd j<CR>
nmap <leader>h :wincmd h<CR>
nmap <leader>l :wincmd l<CR>

" Autoformat
let g:clang_format#style_options = {
  \ 'IndentWidth' : '2',
  \ 'AllowShortIfStatementsOnASingleLine': 'true',
  \ 'AllowShortBlocksOnASingleLine': 'false',
  \ 'AllowShortCaseLabelsOnASingleLine': 'false',
  \ 'AllowShortFunctionsOnASingleLine': 'true',
  \ 'AllowShortLoopsOnASingleLine': 'true',}

" Coc extensions
let g:coc_global_extensions = [
  \ 'coc-tsserver',
  \ 'coc-json',
  \ 'coc-html',
  \ 'coc-css',
  \ 'coc-vetur',
  \ 'coc-pairs',
  \ 'coc-pyright',
  \ 'coc-restclient'
  \ ]

" Vue settings
let g:vim_vue_plugin_use_scss = 1

" Easymotion
let g:EasyMotion_keys = "abcdefghijklmnopqrstuvwxyz"

" Indentline
let g:indentLine_char = '»'
let g:indentLine_color_gui = '#333333'

function! s:find_git_root()
  return system('git rev-parse --show-toplevel 2> /dev/null')[:-2]
endfunction
command! ProjectFiles execute 'Files' s:find_git_root()

" For conditional plugin load
function! Cond(Cond, ...)
  let opts = get(a:000, 0, {})
  return a:Cond ? opts : extend(opts, { 'on': [], 'for': [] })
endfunction


call plug#begin('~/.vim/plugged')

" Interface
Plug 'ap/vim-buftabline'
Plug 'preservim/nerdtree'
Plug 'itchyny/lightline.vim'
Plug 'Yggdroot/indentLine'

" Tools
Plug 'yuezk/vim-js'
Plug 'tpope/vim-commentary'
Plug 'mhinz/vim-signify'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-rhubarb'
Plug 'junegunn/gv.vim'
Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
Plug 'junegunn/fzf.vim'
Plug 'metakirby5/codi.vim'
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'editorconfig/editorconfig-vim'

" Formatting
Plug 'rhysd/vim-clang-format'

" Code refactoring
Plug 'mg979/vim-visual-multi', {'branch': 'master'}
Plug 'AndrewRadev/splitjoin.vim'
Plug 'tpope/vim-surround'

" Auto pairs/close
Plug 'alvan/vim-closetag'
Plug 'mattn/emmet-vim'

" Movement
Plug 'easymotion/vim-easymotion', Cond(!exists('g:vscode'))
Plug 'asvetliakov/vim-easymotion', Cond(exists('g:vscode'), { 'as': 'vsc-easymotion' })

" Syntax highlight / text objects
Plug 'sheerun/vim-polyglot'
Plug 'leafOfTree/vim-vue-plugin'
" Plug 'nvim-treesitter/nvim-treesitter'
Plug 'nvim-treesitter/nvim-treesitter', { 'commit': '3c07232'}
Plug 'nvim-treesitter/nvim-treesitter-textobjects'
Plug 'luochen1990/rainbow'
" Plug 'posva/vim-vue'

" Themes
Plug 'franbach/miramare'
Plug 'sainnhe/gruvbox-material'
Plug 'sainnhe/sonokai'
Plug 'drewtempelmeyer/palenight.vim'
Plug 'ghifarit53/tokyonight-vim'
Plug 'AlessandroYorba/Alduin'
Plug 'embark-theme/vim', { 'as': 'embark' }
Plug 'tjammer/blayu.vim'
Plug 'NLKNguyen/papercolor-theme'

call plug#end()


" Theme configuration
set termguicolors
set background=dark
let g:rainbow_active = 1
let g:gruvbox_material_background = 'hard'
" let g:embark_terminal_italics = 1
" let g:gruvbox_contrast_dark = 'hard'
" let g:tokyonight_style = 'night'
" let g:sonokai_style = 'shusia'
colorscheme miramare

" set background=light
" colorscheme PaperColor

lua <<EOF
require'nvim-treesitter.configs'.setup {
  textobjects = {
    select = {
      enable = true,
      keymaps = {
        ["af"] = "@function.outer",
        ["if"] = "@function.inner",
        ["ac"] = "@class.outer",
        ["ic"] = "@class.inner",
      },
    },
  },
}
EOF

let g:lightline = {
      \ 'colorscheme': 'embark',
      \ 'component': {
      \   'lineinfo': "%{printf('%03d/%03d', line('.'),  line('$'))}",
      \ },
    \ }


" --- Vim-Closetag
" File extensions where the plugin is enabled
let g:closetag_filenames = '*.html,*.xhtml,*.jsx,*.js,*.tsx'
let g:closetag_xhtml_filenames = '*.xml,*.xhtml,*.jsx,*.js,*.tsx'
let g:closetag_filetypes = 'html,xhtml,jsx,js,tsx'
let g:closetag_xhtml_filetypes = 'html,xhtml,jsx,js,tsx'
let g:closetag_emptyTags_caseSensitive = 1

" Disables auto-close if not in a 'valid' region (based on filetype)
let g:closetag_regions = {
    \ 'typescript.tsx': 'jsxRegion,tsxRegion',
    \ 'javascript.jsx': 'jsxRegion',
    \ 'typescriptreact': 'jsxRegion,tsxRegion',
    \ 'javascriptreact': 'jsxRegion',
    \ }

let g:closetag_shortcut = '>'

" Emmet
imap ,, <C-y>,
let g:user_emmet_install_global = 0
autocmd FileType html,css,jsx,tsx,vue EmmetInstall

" Don't pass messages to |ins-completion-menu|.
set shortmess+=c

" Always show the signcolumn, otherwise it would shift the text each time
" diagnostics appear/become resolved.
" Recently vim can merge signcolumn and number column into one
if has("patch-8.1.1564")
  set signcolumn=number
else
  set signcolumn=yes
endif

" Use tab for trigger completion with characters ahead and navigate.
inoremap <silent><expr> <TAB>
      \ pumvisible() ? "\<C-n>" :
      \ <SID>check_back_space() ? "\<TAB>" :
      \ coc#refresh()
inoremap <expr><S-TAB> pumvisible() ? "\<C-p>" : "\<C-h>"

function! s:check_back_space() abort
  let col = col('.') - 1
  return !col || getline('.')[col - 1]  =~# '\s'
endfunction

" Use <c-space> to trigger completion.
if has('nvim')
  inoremap <silent><expr> <c-space> coc#refresh()
else
  inoremap <silent><expr> <c-@> coc#refresh()
endif

" Make <CR> auto-select the first completion item and notify coc.nvim to
" format on enter, <cr> could be remapped by other vim plugin
inoremap <silent><expr> <cr> pumvisible() ? coc#_select_confirm()
			      \: "\<C-g>u\<CR>\<c-r>=coc#on_enter()\<CR>"

" Use `[g` and `]g` to navigate diagnostics
" Use `:CocDiagnostics` to get all diagnostics of current buffer in location list.
nmap <silent> [g <Plug>(coc-diagnostic-prev)
nmap <silent> ]g <Plug>(coc-diagnostic-next)

" GoTo code navigation
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

" K to show documentation in preview window
nnoremap <silent> K :call <SID>show_documentation()<CR>

function! s:show_documentation()
  if (index(['vim','help'], &filetype) >= 0)
    execute 'h '.expand('<cword>')
  elseif (coc#rpc#ready())
    call CocActionAsync('doHover')
  else
    execute '!' . &keywordprg . " " . expand('<cword>')
  endif
endfunction

" Highlight the symbol and its references when holding the cursor.
autocmd CursorHold * silent call CocActionAsync('highlight')

augroup mygroun
  autocmd!
  " Setup formatexpr specified filetype(s).
  autocmd FileType typescript,json setl formatexpr=CocAction('formatSelected')
  " Update signature help on jump placeholder.
  autocmd User CocJumpPlaceholder call CocActionAsync('showSignatureHelp')
augroup end

" Applying codeAction to the selected region.
" Example: `<leader>aap` for current paragraph
xmap <leader>a  <Plug>(coc-codeaction-selected)
nmap <leader>a  <Plug>(coc-codeaction-selected)

" Remap keys for applying codeAction to the current buffer.
nmap <leader>ac  <Plug>(coc-codeaction)
" Apply AutoFix to problem on the current line.
nmap <leader>qf  <Plug>(coc-fix-current)

" Map function and class text objects
" NOTE: Requires 'textDocument.documentSymbol' support from the language server.
xmap if <Plug>(coc-funcobj-i)
omap if <Plug>(coc-funcobj-i)
xmap af <Plug>(coc-funcobj-a)
omap af <Plug>(coc-funcobj-a)
xmap ic <Plug>(coc-classobj-i)
omap ic <Plug>(coc-classobj-i)
xmap ac <Plug>(coc-classobj-a)
omap ac <Plug>(coc-classobj-a)

" Remap <C-f> and <C-b> for scroll float windows/popups.
" Note coc#float#scroll works on neovim >= 0.4.3 or vim >= 8.2.0750
nnoremap <nowait><expr> <C-f> coc#float#has_scroll() ? coc#float#scroll(1) : "\<C-f>"
nnoremap <nowait><expr> <C-b> coc#float#has_scroll() ? coc#float#scroll(0) : "\<C-b>"
inoremap <nowait><expr> <C-f> coc#float#has_scroll() ? "\<c-r>=coc#float#scroll(1)\<cr>" : "\<Right>"
inoremap <nowait><expr> <C-b> coc#float#has_scroll() ? "\<c-r>=coc#float#scroll(0)\<cr>" : "\<Left>"

" Use CTRL-S for selections ranges.
" Requires 'textDocument/selectionRange' support of language server.
nmap <silent> <C-s> <Plug>(coc-range-select)
xmap <silent> <C-s> <Plug>(coc-range-select)

" Add `:Format` command to format current buffer.
command! -nargs=0 Format :call CocAction('format')

" Add `:Fold` command to fold current buffer.
command! -nargs=? Fold :call CocAction('fold', <f-args>)

" Add `:OR` command for organize imports of the current buffer.
command! -nargs=0 OR :call CocAction('runCommand', 'editor.action.organizeImport')

" Mappings for CoCList
" Show all diagnostics.
nnoremap <silent><nowait> <space>a  :<C-u>CocList diagnostics<cr>
" Manage extensions.
nnoremap <silent><nowait> <space>e  :<C-u>CocList extensions<cr>
" Show commands.
nnoremap <silent><nowait> <space>c  :<C-u>CocList commands<cr>
" Find symbol of current document.
nnoremap <silent><nowait> <space>o  :<C-u>CocList outline<cr>
" Search workspace symbols.
nnoremap <silent><nowait> <space>s  :<C-u>CocList -I symbols<cr>
" Do default action for next item.
nnoremap <silent><nowait> <space>j  :<C-u>CocNext<CR>
" Do default action for previous item.
nnoremap <silent><nowait> <space>k  :<C-u>CocPrev<CR>
" Resume latest coc list.
nnoremap <silent><nowait> <space>p  :<C-u>CocListResume<CR>

if exists('g:vscode')
  nnoremap <silent> u :<C-u>call VSCodeNotify('undo')<CR>
  nnoremap <silent> <C-r> :<C-u>call VSCodeNotify('redo')<CR>
endif

