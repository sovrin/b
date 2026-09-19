import INIT_ZSH from './init.zsh' with { type: 'text' };
import STARSHIP_BLOCK from './starship.toml' with { type: 'text' };

export function shellInit(): string {
    return INIT_ZSH;
}

export function starshipSnippet(): string {
    return STARSHIP_BLOCK;
}
