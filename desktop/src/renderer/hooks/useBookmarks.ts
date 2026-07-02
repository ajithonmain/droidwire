import { useState, useEffect } from 'react'

export interface Bookmark {
  name: string
  path: string
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  useEffect(() => {
    window.droidwire.persistGet('bookmarks').then(data => {
      if (Array.isArray(data)) setBookmarks(data as Bookmark[])
    })
  }, [])

  function addBookmark(name: string, path: string) {
    setBookmarks(prev => {
      if (prev.some(b => b.path === path)) return prev
      const next = [...prev, { name, path }]
      window.droidwire.persistSet('bookmarks', next)
      return next
    })
  }

  function removeBookmark(path: string) {
    setBookmarks(prev => {
      const next = prev.filter(b => b.path !== path)
      window.droidwire.persistSet('bookmarks', next)
      return next
    })
  }

  return { bookmarks, addBookmark, removeBookmark }
}
