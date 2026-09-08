import { useEffect, useRef } from 'react'

interface ShortcutActions {
  toggle: () => void
  skipForward: () => void
  skipBackward: () => void
  cycleSpeedUp: () => void
  cycleSpeedDown: () => void
}

const KEY_TO_ACTION = {
  ' ': 'toggle',
  ArrowLeft: 'skipBackward',
  ArrowRight: 'skipForward',
  ArrowUp: 'cycleSpeedUp',
  ArrowDown: 'cycleSpeedDown'
} satisfies Record<string, keyof ShortcutActions>

const IGNORED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useKeyboardShortcuts(actions: ShortcutActions): void {
  const actionsRef = useRef(actions)

  useEffect(() => {
    actionsRef.current = actions
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // SAFETY: Keyboard event targets in DOM tree can be cast to HTMLElement to check tagName
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag && IGNORED_TAGS.has(tag)) return

      const actionKey = KEY_TO_ACTION[e.key]
      if (!actionKey) return

      e.preventDefault()
      actionsRef.current[actionKey]()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
