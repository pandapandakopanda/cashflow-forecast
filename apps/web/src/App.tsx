import { useEffect, useCallback } from "react"

export default  function App() {


  useEffect(   () => {
    fetch('api/health').then((resp) => {
      if(!resp.ok){
        throw new Error('Сервер упал')
      }
    })
  }, [])

  const onClick = useCallback(() => {
    const input = document.getElementById('input')
    if(!(input instanceof HTMLInputElement)) return
    const value = input.value

    

  }, [])
  


  return  <div className="flex w-full h-dvh">
    <div className="">
      App main
    </div>
  </div>


}