export interface Repository {
  id: string
  userId: string
  name: string
  fullName: string
  url: string
  description?: string
  language?: string
  stars?: number
  forks?: number
  isPrivate?: boolean
  githubId?: number
  lastAnalyzedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Story {
  id: string
  userId: string
  title: string
  content: string
  repositoryId?: string
  repository?: Repository
  insights: {
    totalCommits: number
    contributors: number
    languages: string[]
    timespan: string
  }
  createdAt: string
  updatedAt: string
}

export interface StoryInsert {
  userId: string
  title: string
  content: string
  repositoryId?: string
  insights: {
    totalCommits: number
    contributors: number
    languages: string[]
    timespan: string
  }
}

export interface RepositoryInsert {
  userId: string
  name: string
  fullName: string
  url: string
  description?: string
  language?: string
  stars?: number
  forks?: number
  isPrivate?: boolean
  githubId?: number
}