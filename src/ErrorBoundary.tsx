import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: 16,
          background: '#080808', color: '#ccc', fontFamily: 'sans-serif',
        }}>
          <p style={{ fontSize: 16 }}>Ocorreu um erro inesperado.</p>
          {this.state.message && (
            <p style={{ fontSize: 12, color: '#666', maxWidth: 400, textAlign: 'center' }}>
              {this.state.message}
            </p>
          )}
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{
              padding: '8px 20px', borderRadius: 6, border: '1px solid #333',
              background: '#1a1a1a', color: '#ccc', cursor: 'pointer', fontSize: 14,
            }}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
