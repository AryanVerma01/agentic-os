import { resolveClientEndpointParameters } from "@aws-sdk/client-s3/dist-types/endpoint/EndpointParameters";
import CircuitBreaker from "opossum";


export function withResilience(name: string, fn: any, options: any) {

    // initialize circuit CircuitBreaker

    const breaker = new CircuitBreaker(fn, {
        timeout: options.timeout || 8000,
        errorThresholdPercentage: options.errorThresholdPercentage || 50,
        resetTimeout: options.resetTimeout || 15000,
        capacity: options.capacity || 10,         // Bulkhead :  max 10 concurrent calls
        name
    })

    breaker.on("open", () => console.warn(`[BREAKER OPEN] ${name} is down! failing fast`));
    breaker.on("halfOpen", () => console.info(`[BREAKER HALF-OPEN] Testing if ${name} is recovered`));
    breaker.on("close", () => console.log(`[BREAKER CLOSE] ${name} has recovered`));
    breaker.on("reject", () => console.warn(`[BREAKER/BULKHEAD REJECT] ${name} call rejected`));

    // return a function executes breaker function
    return async function (...args: any[]) {

        const maxtries = options.maxRetries ?? 2;
        let attempt = 0;

        while (attempt <= maxtries) {
            try {
                return (await breaker.fire(...args))
            }
            catch (err: any) {
                attempt++;

                if (err.code === "EOPENBREAKER" || err.code === "EBULKHEAD") {
                    throw new Error(`${name} failed : ${err.message}`)
                }

                const waitTime = (attempt * 1000) + (Math.random() * 500);
                console.log(`${name} failed retrying in ${Math.floor(waitTime)}ms...`)

                await new Promise((reslove) => setTimeout(reslove, waitTime))
            }
        }

    }
} 