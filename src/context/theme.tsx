import { themes } from "@/components/themes"
import { createContext, useContext, useEffect, useState } from "react"
import { useEmacs } from "@/context/emacs"

const initialTheme = ['vibrant', themes['one-vibrant']]

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  type Theme = [string, { [color: string]: string }]
  const initialTheme: Theme = ['one-vibrant', themes['one-vibrant']]
  // TODO: Fix initialization phase for theme
  const [isInitialized, setIsInitialized] = useState(false)

  const [emacsTheme, setEmacsTheme] = useState<Theme>(initialTheme)
  const [highlightColor, setHighlightColor] = useState('purple.500')


  const emacsClient = useEmacs()


  useEffect(() => {
    // if (isInitialized) {
    localStorage.setItem('colorTheme', JSON.stringify(emacsTheme))
    // }
  }, [emacsTheme])

  useEffect(() => {
    // if (isInitialized) {
    localStorage.setItem('highlightColor', JSON.stringify(highlightColor))
    // }
  }, [highlightColor])

  useEffect(() => {
    const themePromise = emacsClient.getTheme()
    themePromise.then((res) => {
      setEmacsTheme([res.name, res.colors as { [color: string]: string }])
    }).catch((e) => {
      setEmacsTheme(
        JSON.parse(localStorage.getItem('colorTheme') ?? JSON.stringify(initialTheme)) ??
        initialTheme,
      )
    })
    setHighlightColor(
      JSON.parse(localStorage.getItem('highlightColor') ?? JSON.stringify(highlightColor)) ??
      highlightColor,
    )
    // setIsInitialized(true)
  }, [])

  const themeObject = {
    emacsTheme: emacsTheme,
    setEmacsTheme: setEmacsTheme,
    highlightColor: highlightColor,
    setHighlightColor: setHighlightColor,
  }

  return <ThemeContext.Provider value={themeObject}>{children}</ThemeContext.Provider>
}

interface ThemeContextProps {
  emacsTheme: typeof initialTheme
  setEmacsTheme: any
  highlightColor: string
  setHighlightColor: any
}

const ThemeContext = createContext<ThemeContextProps | undefined>({
  emacsTheme: initialTheme,
  setEmacsTheme: null,
  highlightColor: 'purple',
  setHighlightColor: null,
})

export function useTheme(): ThemeContextProps {
  const ctx = useContext(ThemeContext)
  if (ctx === undefined) {
    throw new Error('useTheme must be used within an ThemeProvider')
  }
  return ctx
}
