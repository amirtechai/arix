import type { Command } from 'commander'

const BASH_COMPLETION = `
# Arix bash completion
_arix_completions() {
  local cur prev words
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  words="chat config session skill init tui dashboard --help --version --debug"

  case "\${prev}" in
    session)
      COMPREPLY=( \$(compgen -W "list load export delete" -- "\${cur}") )
      return 0
      ;;
    config)
      COMPREPLY=( \$(compgen -W "get set list" -- "\${cur}") )
      return 0
      ;;
    skill)
      COMPREPLY=( \$(compgen -W "list show" -- "\${cur}") )
      return 0
      ;;
  esac

  COMPREPLY=( \$(compgen -W "\${words}" -- "\${cur}") )
}
complete -F _arix_completions arix
`

const ZSH_COMPLETION = `
#compdef arix

_arix() {
  local state

  _arguments \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-V --version)'{-V,--version}'[Show version]' \\
    '--debug[Enable debug logging]' \\
    '1: :->command' \\
    '*: :->args'

  case \$state in
    command)
      _values 'commands' \\
        'chat[Start an interactive chat session]' \\
        'config[Manage configuration]' \\
        'session[Manage sessions]' \\
        'skill[Manage skills]' \\
        'init[Initialize Arix]' \\
        'tui[Launch interactive TUI]' \\
        'dashboard[Start web dashboard]'
      ;;
    args)
      case \${words[2]} in
        session)
          _values 'subcommands' list load export delete ;;
        config)
          _values 'subcommands' get set list ;;
        skill)
          _values 'subcommands' list show ;;
      esac
      ;;
  esac
}

_arix
`

export function registerCompletions(program: Command): void {
  program
    .command('completions <shell>')
    .description('Print shell completion script (bash | zsh)')
    .addHelpText('after', `
Examples:
  arix completions bash >> ~/.bashrc && source ~/.bashrc
  arix completions zsh  >> ~/.zshrc  && source ~/.zshrc`)
    .action((shell: string) => {
      if (shell === 'bash') {
        process.stdout.write(BASH_COMPLETION.trimStart())
      } else if (shell === 'zsh') {
        process.stdout.write(ZSH_COMPLETION.trimStart())
      } else {
        process.stderr.write(`Unknown shell: ${shell}\nSupported: bash, zsh\n`)
        process.exit(1)
      }
    })
}
