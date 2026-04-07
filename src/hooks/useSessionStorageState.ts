import { useEffect, useState } from 'react'

type InitialValue<T> = T | (() => T)
type Validator<T> = (value: unknown) => value is T

function resolveInitialValue<T>(initialValue: InitialValue<T>) {
  return typeof initialValue === 'function'
    ? (initialValue as () => T)()
    : initialValue
}

function readSessionStorageValue<T>(
  key: string,
  initialValue: InitialValue<T>,
  validator?: Validator<T>,
) {
  const fallback = resolveInitialValue(initialValue)

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const rawValue = window.sessionStorage.getItem(key)
    if (rawValue == null) return fallback

    const parsedValue = JSON.parse(rawValue) as unknown
    if (validator && !validator(parsedValue)) return fallback

    return parsedValue as T
  } catch {
    return fallback
  }
}

export function useSessionStorageState<T>(
  key: string,
  initialValue: InitialValue<T>,
  validator?: Validator<T>,
) {
  const [state, setState] = useState<T>(() => readSessionStorageValue(key, initialValue, validator))

  useEffect(() => {
    setState(readSessionStorageValue(key, initialValue, validator))
  }, [key])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.sessionStorage.setItem(key, JSON.stringify(state))
    } catch {
      // Ignore quota/security errors and keep the in-memory state working.
    }
  }, [key, state])

  return [state, setState] as const
}
