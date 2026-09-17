export interface User {
  id: string;
  tenantId: string;
  email: string;
  status: 'active' | 'invited' | 'disabled';
}

export interface Organization {
  id: string;
  name: string;
  plan: 'starter' | 'professional' | 'enterprise';
  maxUsers: number;
}
