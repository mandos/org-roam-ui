import { themes } from "@/components/themes"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { useEmacs } from "@/context/emacs"
import { createLogger } from "@/utils/logger"
import { interpolateRgb } from "d3-interpolate"

const log = createLogger("theme")

const COLOR_KEYS = [
  'magenta', 'violet', 'blue', 'cyan', 'teal', 'green', 'yellow', 'orange', 'red',
  'bg', 'fg',
  'base0', 'base1', 'base2', 'base3', 'base4', 'base5', 'base6', 'base7', 'base8'] as const

export type ColorPalette = {
  [K in typeof COLOR_KEYS[number]]: string
}

function isColorPalette(data: unknown): data is ColorPalette {
  return (
    typeof data === 'object' && data !== null && COLOR_KEYS.every((key) => typeof (data as any)[key] === 'string')
  )
}

function sanitizeColorPalette(data: unknown): ColorPalette {
  if (typeof data !== 'object' || data === null) {
    throw Error("data is not object")
  }
  // TODO: Add information (warning?) about missing colors
  const missingColors = COLOR_KEYS.filter((key) => typeof (data as any)[key] !== 'string')
  // TODO: Add better missing color handling
  const patch: Partial<ColorPalette> = Object.fromEntries(missingColors.map((key) => [key, '#FF0000']))
  return { ...(data as object), ...patch } as ColorPalette
}

type Theme = [string, ColorPalette]

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorPallete = themes['one-vibrant']
  let initialTheme: Theme
  if (isColorPalette(colorPallete)) {
    initialTheme = ['one-vibrant', colorPallete];
  } else {
    throw Error("Cannot initialize default colorPallet (one-vibrant)")
  }

  // TODO: Add new initialization phase for theme
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
      setEmacsTheme([res.name, sanitizeColorPalette(res.colors)])
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

  const colorInterpolationMatrix = useMemo(() => {
    const pallete: ColorPalette = emacsTheme[1]
    return Object.fromEntries(
      COLOR_KEYS.map((colorA) =>
        [colorA,
          Object.fromEntries(
            COLOR_KEYS.map((colorB) => [colorB, interpolateRgb(pallete[colorA], pallete[colorB])])
          )]
      ))
  }, [emacsTheme])

  const themeObject = useMemo(() => {
    return {
      emacsTheme: emacsTheme,
      setEmacsTheme: setEmacsTheme,
      colorInterpolationMatrix: colorInterpolationMatrix,
      // TODO: I don't want higlights, fade out shoud be enough
      highlightColor: highlightColor,
      setHighlightColor: setHighlightColor,
    }
  }, [emacsTheme])

  return <ThemeContext.Provider value={themeObject}>{children}</ThemeContext.Provider>
}

export interface ThemeContextProps {
  emacsTheme: Theme
  setEmacsTheme: any
  // TODO: I would like to have better typing for Interpolation matrix but for now I don't know how to do it
  colorInterpolationMatrix: any
  // colorInterpolationMatrix: Record<keyof ColorPalette, Record<keyof ColorPalette, (t: number) => string>>
  // TODO: I don't want higlights, fade out shoud be enough
  highlightColor: string
  setHighlightColor: any
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined)

export function useTheme(): ThemeContextProps {
  const ctx = useContext(ThemeContext)
  if (ctx === undefined) {
    throw new Error('useTheme must be used within an ThemeProvider')
  }
  return ctx
}
