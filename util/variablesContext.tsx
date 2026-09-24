import { EmacsVariables } from '@/emacs/api'
import { createContext } from 'react'

type Theme = [name: string, themeObject: { [color: string]: string }]

const VariablesContext = createContext<EmacsVariables>({
  subDirs: ['dailies', '.attach'],
  attachDir: '.attach',
  useInheritance: false,
  roamDir: '~/org',
  dailyDir: 'dailies',
})
export { VariablesContext }
