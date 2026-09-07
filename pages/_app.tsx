import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ChakraProvider, extendTheme, withDefaultColorScheme } from '@chakra-ui/react'
import { useMemo, useContext } from 'react'
import * as d3int from 'd3-interpolate'
import { EmacsProvider } from '@/context/emacs'
import { ThemeProvider, useTheme } from '@/context/theme'

function MyApp({ Component, pageProps }: AppProps) {

  return (
    <EmacsProvider>
      <ThemeProvider>
        <ChakraThemeProvider>
          <Component {...pageProps} />
        </ChakraThemeProvider>
      </ThemeProvider>
    </EmacsProvider>
  )
}

function ChakraThemeProvider(props: any) {
  const { children } = props
  const { highlightColor, emacsTheme } = useTheme()
  type Theme = { [color: string]: string }
  const themeColors: Theme = emacsTheme[1] as Theme
  const missingColor = d3int.interpolate(themeColors['base1'], themeColors['base2'])(0.2)

  // Mirrors the color sources used to build `theme.colors` below, so the
  // resolved border color always matches what the corresponding Chakra
  // token (e.g. `gray.200`) actually renders as.
  const highlightToThemeColors: Record<string, string> = {
    'purple.500': 'violet',
    'pink.500': 'magenta',
    'blue.500': 'blue',
    'cyan.500': 'cyan',
    'green.500': 'green',
    'yellow.500': 'yellow',
    'orange.500': 'orange',
    'red.500': 'red',
    white: 'bg',
    black: 'fg',
    'gray.100': 'base1',
    'gray.200': 'missingColor',
    'gray.300': 'base2',
    'gray.400': 'base3',
    'gray.500': 'base4',
    'gray.600': 'base5',
    'gray.700': 'base6',
    'gray.800': 'base7',
    'gray.900': 'base8',
  }
  const getBorderColor = () => {
    const resolvedColors: Theme = { ...themeColors, missingColor }
    const key = highlightToThemeColors[highlightColor]
    const color = key && resolvedColors[key]
    // Fallback only reachable if `colorList` (components/config.ts) ever
    // grows an accent color not listed above.
    return color ? `${color}aa` : 'red'
  }

  const borderColor = getBorderColor()
  const theme = useMemo(() => {
    return {
      colors: {
        white: themeColors['bg'],
        black: themeColors['fg'],
        gray: {
          100: themeColors['base1'],
          200: missingColor,
          300: themeColors['base2'],
          400: themeColors['base3'],
          500: themeColors['base4'],
          600: themeColors['base5'],
          700: themeColors['base6'],
          800: themeColors['base7'],
          900: themeColors['base8'],
        },
        blue: {
          500: themeColors['blue'],
        },
        teal: {
          500: themeColors['blue'],
        },
        yellow: {
          500: themeColors['yellow'],
        },
        orange: {
          500: themeColors['orange'],
        },
        red: {
          500: themeColors['red'],
        },
        green: {
          500: themeColors['green'],
        },
        purple: {
          500: themeColors['violet'],
        },
        pink: {
          500: themeColors['magenta'],
        },
        cyan: {
          500: themeColors['cyan'],
        },
        alt: {
          100: themeColors['bg-alt'],
          900: themeColors['fg-alt'],
        },
      },
      shadows: {
        outline: '0 0 0 3px ' + borderColor,
      },
      components: {
        Button: {
          variants: {
            outline: {
              border: '2px solid',
              borderColor: highlightColor,
              color: highlightColor,
            },
            ghost: {
              color: highlightColor,
              _hover: { bg: `inherit`, border: '1px solid', borderColor: highlightColor },
              _active: { color: `inherit`, bg: highlightColor },
            },
            subtle: {
              color: 'gray.800',
              _hover: { bg: `inherit`, color: highlightColor },
              _active: { color: `inherit`, bg: borderColor },
            },
          },
        },
        Accordion: {
          baseStyle: {
            container: {
              marginTop: '10px',
              borderWidth: '0px',
              _last: {
                borderWidth: '0px',
              },
            },
            panel: {
              marginRight: '10px',
            },
          },
        },
        Slider: {
          baseStyle: (props: any) => ({
            thumb: {
              backgroundColor: highlightColor,
            },
            filledTrack: {
              backgroundColor: 'gray.400',
            },
            track: {
              backgroundColor: 'gray.400',
              borderColor: 'gray.400',
              borderWidth: '5px',
              borderRadius: 'lg',
            },
          }),
        },
      },
    }
  }, [highlightColor, JSON.stringify(emacsTheme)])

  const extendedTheme = extendTheme(
    theme,
    withDefaultColorScheme({ colorScheme: highlightColor.split('.')[0] }),
  )
  return <ChakraProvider theme={extendedTheme}>{children}</ChakraProvider>
}
export default MyApp
