import { blink } from '../blink/client'

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  created_at: string
  updated_at: string
  pushed_at: string
  size: number
  default_branch: string
  topics: string[]
  private: boolean
  owner: {
    login: string
    avatar_url: string
    type: string
  }
}

export interface GitHubCommitStats {
  total: number
  weeks: Array<{
    w: number // Unix timestamp
    a: number // Additions
    d: number // Deletions
    c: number // Commits
  }>
}

export interface GitHubContributor {
  login: string
  contributions: number
  avatar_url: string
  type: string
}

export interface GitHubLanguages {
  [language: string]: number
}

export interface GitHubRepoAnalysis {
  repo: GitHubRepo
  contributors: GitHubContributor[]
  languages: GitHubLanguages
  commitStats: GitHubCommitStats
  totalCommits: number
  timespan: {
    firstCommit: Date
    lastCommit: Date
    durationDays: number
  }
}

export async function fetchGitHubRepository(repoUrl: string): Promise<GitHubRepoAnalysis | null> {
  try {
    // Extract owner and repo name from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/i)
    if (!match) {
      throw new Error('Invalid GitHub repository URL')
    }
    
    const [, owner, repoName] = match
    const cleanRepoName = repoName.replace(/\.git$/, '') // Remove .git suffix if present
    
    console.log(`Fetching GitHub repo: ${owner}/${cleanRepoName}`)
    
    // Fetch repository data using Blink's secure API proxy
    const repoResponse = await blink.data.fetch({
      url: `https://api.github.com/repos/${owner}/${cleanRepoName}`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    if (repoResponse.status === 404) {
      throw new Error('Repository not found. Please check the URL and ensure the repository is public.')
    }
    
    if (repoResponse.status !== 200) {
      throw new Error(`GitHub API error: ${repoResponse.status} - ${repoResponse.statusText}`)
    }
    
    const repo = repoResponse.body as GitHubRepo
    
    // Fetch contributors
    const contributorsResponse = await blink.data.fetch({
      url: `https://api.github.com/repos/${owner}/${cleanRepoName}/contributors`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      },
      query: {
        per_page: '30' // Get top 30 contributors
      }
    })
    
    const contributors = contributorsResponse.status === 200 
      ? (contributorsResponse.body as GitHubContributor[])
      : []
    
    // Fetch languages
    const languagesResponse = await blink.data.fetch({
      url: `https://api.github.com/repos/${owner}/${cleanRepoName}/languages`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    const languages = languagesResponse.status === 200 
      ? (languagesResponse.body as GitHubLanguages)
      : {}
    
    // Fetch commit statistics (last year)
    const statsResponse = await blink.data.fetch({
      url: `https://api.github.com/repos/${owner}/${cleanRepoName}/stats/commit_activity`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    // GitHub returns 202 if stats are being calculated, we'll use repo dates as fallback
    let totalCommits = 0
    let commitStats: GitHubCommitStats = { total: 0, weeks: [] }
    
    if (statsResponse.status === 200 && Array.isArray(statsResponse.body)) {
      const weeks = statsResponse.body as Array<{ total: number, week: number }>
      totalCommits = weeks.reduce((sum, week) => sum + week.total, 0)
      commitStats = {
        total: totalCommits,
        weeks: weeks.map(w => ({
          w: w.week,
          a: 0,
          d: 0,
          c: w.total
        }))
      }
    }
    
    // Calculate timespan
    const createdDate = new Date(repo.created_at)
    const updatedDate = new Date(repo.pushed_at || repo.updated_at)
    const durationMs = updatedDate.getTime() - createdDate.getTime()
    const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24))
    
    // If we couldn't get commit stats, estimate based on repo age and activity
    if (totalCommits === 0) {
      // Rough estimate: 1-5 commits per week based on activity
      const weeksActive = Math.ceil(durationDays / 7)
      totalCommits = Math.max(weeksActive * 2, 10) // At least 10 commits
    }
    
    return {
      repo,
      contributors,
      languages,
      commitStats,
      totalCommits,
      timespan: {
        firstCommit: createdDate,
        lastCommit: updatedDate,
        durationDays
      }
    }
  } catch (error) {
    console.error('Error fetching GitHub repository:', error)
    throw error
  }
}

export function formatTimespan(days: number): string {
  if (days < 30) {
    return `${days} days`
  } else if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} month${months > 1 ? 's' : ''}`
  } else {
    const years = Math.floor(days / 365)
    const months = Math.floor((days % 365) / 30)
    if (months > 0) {
      return `${years} year${years > 1 ? 's' : ''}, ${months} month${months > 1 ? 's' : ''}`
    }
    return `${years} year${years > 1 ? 's' : ''}`
  }
}

export function getTopLanguages(languages: GitHubLanguages, limit = 5): string[] {
  return Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([lang]) => lang)
}