export interface FinancialIntegrationConsent {
  providerId: string;
  providerName: string;
  status: 'not_enabled' | 'pending_consent' | 'connected' | 'disconnected';
  message: string;
  capabilities: string[];
}

export interface FinancialDataProvider {
  readonly providerId: string;
  readonly providerName: string;
  connect(): Promise<FinancialIntegrationConsent>;
  getConsentStatus(): Promise<FinancialIntegrationConsent>;
  fetchTransactions(): Promise<never[]>;
  disconnect(): Promise<FinancialIntegrationConsent>;
}

/**
 * Extensible Account Aggregator / Open Banking adapter interface.
 * Live banking connections are explicitly disabled in MVP until official
 * licensed Account Aggregator sandbox/production credentials are configured.
 */
export class AccountAggregatorStubAdapter implements FinancialDataProvider {
  readonly providerId = 'indian_account_aggregator';
  readonly providerName = 'Account Aggregator (Sahamati / FIP)';

  async connect(): Promise<FinancialIntegrationConsent> {
    return {
      providerId: this.providerId,
      providerName: this.providerName,
      status: 'not_enabled',
      message:
        'Live Account Aggregator connections are not enabled in this MVP. Use CSV statement upload or manual transaction entry instead.',
      capabilities: ['csv_upload', 'manual_entry'],
    };
  }

  async getConsentStatus(): Promise<FinancialIntegrationConsent> {
    return {
      providerId: this.providerId,
      providerName: this.providerName,
      status: 'not_enabled',
      message: 'Live banking integrations are disabled; no bank credentials or OTPs are collected.',
      capabilities: ['csv_upload', 'manual_entry'],
    };
  }

  async fetchTransactions(): Promise<never[]> {
    return [];
  }

  async disconnect(): Promise<FinancialIntegrationConsent> {
    return this.getConsentStatus();
  }
}
