import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from '../lib/toast'
import { translateFunctionErrorMessage } from '../lib/functionError'

export function useToastErrorState(initialValue = ''): [string, Dispatch<SetStateAction<string>>] {
  const [value, setValue] = useState(initialValue)
  const valueRef = useRef(initialValue)

  const setError = useCallback<Dispatch<SetStateAction<string>>>((nextValue) => {
    const resolvedValue = typeof nextValue === 'function' ? nextValue(valueRef.current) : nextValue
    const translatedValue = resolvedValue.trim()
      ? translateFunctionErrorMessage(resolvedValue)
      : resolvedValue

    valueRef.current = translatedValue
    setValue(translatedValue)
    if (translatedValue) toast.error(translatedValue)
  }, [])

  return [value, setError]
}
