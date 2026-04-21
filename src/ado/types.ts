export interface AdoProject {
  id: string;
  name: string;
  description?: string;
  url: string;
  state?: string;
}

export interface AdoTeam {
  id: string;
  name: string;
  description?: string;
  projectName?: string;
  projectId?: string;
  url?: string;
}

export interface AdoList<T> {
  count: number;
  value: T[];
}
