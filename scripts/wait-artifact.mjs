// Upload storage and REST metadata can become consistent at different times.
const {GITHUB_API_URL,GITHUB_REPOSITORY,GITHUB_RUN_ID,GH_TOKEN,ARTIFACT_NAME}=process.env;
if(!GITHUB_REPOSITORY||!GITHUB_RUN_ID||!GH_TOKEN||!ARTIFACT_NAME)throw new Error('Missing workflow context');
for(let attempt=0;attempt<20;attempt++){
  const response=await fetch(`${GITHUB_API_URL||'https://api.github.com'}/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts`,{headers:{Authorization:`Bearer ${GH_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Artifact metadata returned ${response.status}`);
  const data=await response.json();
  if(data.artifacts?.some(a=>a.name===ARTIFACT_NAME&&!a.expired)){console.log('Website artifact is ready for deployment.');process.exit(0);}
  await new Promise(resolve=>setTimeout(resolve,3000));
}
throw new Error('Website artifact metadata did not become ready in time');
