import { ok, route } from "@/server/core/http";
import { dispatchIntegration } from "@/server/modules/integrations";

type Ctx = { params: { path: string[] } };

const handle = (req: Request, { params }: Ctx) => dispatchIntegration(req, params.path).then(ok);

export const GET = route(handle);
export const POST = route(handle);

export const dynamic = "force-dynamic";
