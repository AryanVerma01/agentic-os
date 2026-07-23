// services/evals/llm-judge.ts
export async function judgeWithLLM(
    input: string,
    agentOutput: string,
    rubric: string
): Promise<{ pass: boolean; reason: string }> {

    const judgePrompt = `
You are an expert QA evaluator.
USER INPUT: "${input}"
AGENT OUTPUT: "${agentOutput}"

RUBRIC: ${rubric}

Did the agent output satisfy the rubric? 
You must respond with ONLY valid JSON in this exact format:
{
  "pass": true or false,
  "reason": "short explanation of why"
}
  `;

    // Example using raw fetch to OpenAI (can swap to LangChain/Anthropic SDK)
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini", // Use a fast/cheap model for judging
            messages: [{ role: "system", content: judgePrompt }],
            response_format: { type: "json_object" },
            temperature: 0, // 0 temp for deterministic grading
        }),
    });

    const data = await res.json();
    try {
        return JSON.parse(data.choices[0].message.content);
    } catch (err) {
        return { pass: false, reason: "Judge failed to return valid JSON." };
    }
}