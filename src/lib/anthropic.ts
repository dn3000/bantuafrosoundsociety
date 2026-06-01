type ClaudeMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ClaudeResponse = {
  content: { type: string; text: string }[]
}

export async function claudeMessage(
  messages: ClaudeMessage[],
  options: { maxTokens?: number; system?: string; model?: string } = {}
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY in environment')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'claude-sonnet-4-5',
      max_tokens: options.maxTokens || 1024,
      system: options.system,
      messages,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API error: ${res.status} ${text}`)
  }

  const data = await res.json() as ClaudeResponse
  const textBlock = data.content.find((b) => b.type === 'text')
  if (!textBlock) {
    throw new Error('No text content in Claude response')
  }
  return textBlock.text
}

export function extractJsonFromText(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // Try to find JSON inside markdown code fences or surrounded by other text
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim())
      } catch {
        // fall through
      }
    }
    const objectMatch = text.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0])
      } catch {
        // fall through
      }
    }
    throw new Error('Failed to parse JSON from Claude response')
  }
}
