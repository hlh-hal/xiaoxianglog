import { localVaultService } from './localVaultService';

export type FirstInstallVaultOnboardingState =
  | 'pending'
  | 'completed'
  | 'skipped'
  | 'existing-user';

const STATE_KEY = 'xiang_first_install_vault_onboarding_state';
const STATE_CHANGED_EVENT = 'xiang-first-install-vault-onboarding-change';

export interface FirstInstallVaultOnboardingInitOptions {
  hasExistingEntries?: boolean;
}

function emitStateChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STATE_CHANGED_EVENT));
}

function readState(): FirstInstallVaultOnboardingState | null {
  const value = localStorage.getItem(STATE_KEY);
  if (
    value === 'pending'
    || value === 'completed'
    || value === 'skipped'
    || value === 'existing-user'
  ) {
    return value;
  }
  return null;
}

function writeState(state: FirstInstallVaultOnboardingState): FirstInstallVaultOnboardingState {
  localStorage.setItem(STATE_KEY, state);
  emitStateChanged();
  return state;
}

async function hasAuthorizedVault(): Promise<boolean> {
  try {
    const status = await localVaultService.getVaultStatus();
    return Boolean(status.authorized || status.available);
  } catch {
    return false;
  }
}

export const firstInstallVaultOnboardingService = {
  stateChangedEvent: STATE_CHANGED_EVENT,

  getState(): FirstInstallVaultOnboardingState | null {
    return readState();
  },

  async initialize(options: FirstInstallVaultOnboardingInitOptions = {}): Promise<FirstInstallVaultOnboardingState> {
    const currentState = readState();
    if (currentState) return currentState;

    const hasOldInstallMarker =
      localStorage.getItem('xiang_welcome_created') === 'true'
      || Boolean(localStorage.getItem('app_session'))
      || Boolean(options.hasExistingEntries)
      || await hasAuthorizedVault();

    return writeState(hasOldInstallMarker ? 'existing-user' : 'pending');
  },

  shouldShow(): boolean {
    return readState() === 'pending';
  },

  complete(): void {
    writeState('completed');
  },

  skip(): void {
    writeState('skipped');
  },

  markExistingUser(): void {
    writeState('existing-user');
  },
};
