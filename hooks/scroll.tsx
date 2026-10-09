import type { ClientModule } from 'claude-code'

type Seg = { text: string; color?: string; dim?: boolean; bold?: boolean }

// The agents rows, drawn as given; once a click focuses them, ↑/↓ ask the hooks module to scroll.
const Scroll: ClientModule<{ lines: Seg[][] }> = (props, surface) => {
  const { Box, Text } = surface.elements
  surface.onKey(k => {
    if (k.key === 'down') surface.post({ by: 1 })
    if (k.key === 'up') surface.post({ by: -1 })
  })
  return (
    <Box flexDirection="column">
      {props.lines.map(l => (
        <Text wrap="truncate-end">
          {l.map(s => (
            <Text color={s.color} dimColor={s.dim} bold={s.bold}>
              {s.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Scroll
