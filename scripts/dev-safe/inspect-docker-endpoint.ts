import { inspectExecutable, inspectLocalDockerEndpoint } from "./environment"

const docker = inspectExecutable(Bun.which("docker") ?? undefined, "Docker CLI")
const endpoint = inspectLocalDockerEndpoint(process.env.ALLURA_DEV_SAFE_DOCKER_ENDPOINT)

process.stdout.write(`${docker}\t${endpoint}\n`)
