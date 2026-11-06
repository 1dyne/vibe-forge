import { NextRequest } from "next/server";
import { canAccess, getViewer, withViewerVault } from "../../../../../../lib/viewer";
import { getProject } from "../../../../../../lib/local-project-store";
async function handleGET(request: NextRequest, context: {params:Promise<{id:string;fileId:string}>}) {
  const {id,fileId}=await context.params;
  const viewer=await getViewer(request);
  const found=await getProject(id);
  const project=viewer&&canAccess(viewer,found)?found:null;
  const file=project?.workspaceFiles?.find(f=>f.id===fileId);
  if(!file)return Response.json({error:"파일을 찾을 수 없습니다."},{status:404});
  return new Response(file.content,{headers:{"content-type":"text/plain; charset=utf-8","content-disposition":'attachment; filename="'+file.filename.replace(/[^A-Za-z0-9._-]/g,"_")+'"',"x-content-type-options":"nosniff","cache-control":"private, no-store"}});
}

export const GET = withViewerVault(handleGET);
