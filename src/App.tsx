import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

export interface User {
  name: string
  email: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)

  const handleLogin = (userData: User) => {
    setUser(userData)
  }

  const handleLogout = () => {
    setUser(null)
  }

  if (user) {
    return <DashboardPage user={user} onLogout={handleLogout} />
  }

  return <LoginPage onLogin={handleLogin} />
}

export default App
