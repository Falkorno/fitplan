import React from 'react'
import ReactDOM from 'react-dom/client'
import { MockupApp } from './MockupApp'
import './mockup.css'

ReactDOM.createRoot(document.getElementById('mockup-root')!).render(
  <React.StrictMode><MockupApp /></React.StrictMode>,
)