import { useRouter, useRoute } from 'vue-router'

export const useMobile = () => {
  const router = useRouter()
  const route = useRoute()

  const back = () => {
    
    if (window.innerWidth < 768) {
      if (route.path.split('/').length > 3) {
        
        router.back()
        return
      }
      
      
      return
    }
    
    
  }
  return {
    back
  }
}
