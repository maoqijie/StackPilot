

type ServiceRecord = {
  id: string;
  name: string;
  host: string;
  status: "active" | "failed" | "inactive";
  restarts: number;
  memory: string;
  updated: string;
  handled?: boolean;
};

export type { ServiceRecord };
