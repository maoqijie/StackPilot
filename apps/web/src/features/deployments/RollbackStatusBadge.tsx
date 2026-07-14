import { CheckCircle2, CircleAlert, CircleDot, Clock3, RotateCcw, XCircle } from "lucide-react";
import type { SiteRollbackRecord } from "../../api/deploymentsApi";
import { statusText } from "./rollbackModel";

function RollbackStatusBadge({ status }: { status: SiteRollbackRecord["status"] }) {
  const definition = status === "available" ? { tone: "blue", Icon: RotateCcw }
    : status === "queued" ? { tone: "orange", Icon: Clock3 }
      : status === "running" ? { tone: "blue", Icon: CircleDot }
        : status === "succeeded" ? { tone: "green", Icon: CheckCircle2 }
          : status === "failed" ? { tone: "red", Icon: XCircle }
            : { tone: "gray", Icon: CircleAlert };
  const { tone, Icon } = definition;
  return <span className={`pill status-with-icon ${tone}`}><Icon size={14} aria-hidden="true" />{statusText[status]}</span>;
}

export { RollbackStatusBadge };
