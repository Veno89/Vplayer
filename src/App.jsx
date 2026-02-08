import React from 'react'
import VPlayer from './VPlayer'
import { PlayerProvider } from './context/PlayerProvider'

export default function App() {
  return (
    <div>
      <PlayerProvider>
        <VPlayer />
      </PlayerProvider>
    </div>
  )
}
