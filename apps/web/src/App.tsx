import { useEffect, useCallback } from "react"

export default  function App() {


  useEffect(   () => {
    fetch('api/health').then((resp) => {
      if(!resp.ok){
        throw new Error('Сервер упал')
      }
    })
  }, [])

  return  <div className="flex w-full h-dvh">
    <div className="text-h1 font-medium w-full h-full bg-page-bg text-text-main">
      App main
    </div>
  </div>


}