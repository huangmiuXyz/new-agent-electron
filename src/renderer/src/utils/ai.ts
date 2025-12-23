export function getMessageText({ prompt }: { prompt: any }): string | null {
  if (typeof prompt === 'string') {
    return prompt
  }

  if (Array.isArray(prompt)) {
    for (let i = prompt.length - 1; i >= 0; i--) {
      const message = prompt[i]
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          return message.content
        }
        if (Array.isArray(message.content)) {
          const textPart = message.content.find((part: any) => part.type === 'text')
          if (textPart && textPart.text) {
            return textPart.text
          }
        }
      }
    }
  }

  return null
}

export function addMessageText({ params, text }: { params: any; text: string }): any {
  if (typeof params.prompt === 'string') {
    return {
      ...params,
      prompt: text
    }
  }

  if (Array.isArray(params.prompt)) {
    const newPrompt = [...params.prompt]

    for (let i = newPrompt.length - 1; i >= 0; i--) {
      const message = newPrompt[i]
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          newPrompt[i] = {
            ...message,
            content: text
          }
        } else if (Array.isArray(message.content)) {
          const newContent = message.content.map((part: any) => {
            if (part.type === 'text') {
              return {
                ...part,
                text
              }
            }
            return part
          })
          newPrompt[i] = {
            ...message,
            content: newContent
          }
        }
        break
      }
    }

    return {
      ...params,
      prompt: newPrompt
    }
  }

  return params
}
