export function getPool(): never { throw new Error('network databases are forbidden in this test harness') }
export const getAppPool = getPool
