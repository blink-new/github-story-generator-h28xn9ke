import { useState, useEffect } from 'react'
import { blink } from './blink/client'
import { supabase, setSupabaseAuth } from './lib/supabase'
import { type Story, type Repository, type StoryInsert, type RepositoryInsert } from './lib/types'
import { fetchGitHubRepository, formatTimespan, getTopLanguages } from './lib/github'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Badge } from './components/ui/badge'
import { Progress } from './components/ui/progress'
import { Separator } from './components/ui/separator'
import { Github, BookOpen, Sparkles, Clock, Users, GitBranch, FileText, Download, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from './components/ui/alert'

interface User {
  id: string
  email: string
  displayName?: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [repoUrl, setRepoUrl] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStory, setCurrentStory] = useState<Story | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      setUser(state.user)
      setLoading(state.isLoading)
      
      // Set Supabase authentication with Blink JWT token
      if (state.user && state.tokens?.accessToken) {
        setSupabaseAuth(state.tokens.accessToken)
        // Load stories when user is authenticated
        loadUserStories(state.user.id)
      } else if (!state.user && !state.isLoading) {
        setSupabaseAuth(null)
        // Clear stories when user logs out
        setStories([])
        setCurrentStory(null)
      }
    })
    return unsubscribe
  }, [])

  const loadUserStories = async (userId: string) => {
    try {
      setError(null)
      
      // Get stories with repository data using Supabase
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          repository:repositories(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading stories:', error)
        setError('Failed to load stories')
        return
      }

      // Convert snake_case to camelCase for consistency
      const storiesWithRepos = (data || []).map(story => ({
        id: story.id,
        userId: story.user_id,
        title: story.title,
        content: story.content,
        repositoryId: story.repository_id,
        insights: story.insights,
        createdAt: story.created_at,
        updatedAt: story.updated_at,
        repository: story.repository ? {
          id: story.repository.id,
          userId: story.repository.user_id,
          name: story.repository.name,
          fullName: story.repository.full_name,
          url: story.repository.url,
          description: story.repository.description,
          language: story.repository.language,
          stars: story.repository.stars,
          forks: story.repository.forks,
          isPrivate: story.repository.is_private,
          githubId: story.repository.github_id,
          lastAnalyzedAt: story.repository.last_analyzed_at,
          createdAt: story.repository.created_at,
          updatedAt: story.repository.updated_at
        } : null
      }))

      setStories(storiesWithRepos)
    } catch (error) {
      console.error('Error loading stories:', error)
      setError('Failed to load stories')
    }
  }

  const findOrCreateRepository = async (repoData: RepositoryInsert): Promise<string | null> => {
    try {
      // First, try to find existing repository owned by current user
      const { data: existingRepos, error: findError } = await supabase
        .from('repositories')
        .select('id, user_id')
        .eq('url', repoData.url)

      if (findError) {
        console.error('Error finding repository:', findError)
        return null
      }

      // Check if user already has this repository
      const userRepo = existingRepos?.find(repo => repo.user_id === repoData.userId)
      if (userRepo) {
        return userRepo.id
      }

      // If repository exists but belongs to another user, create user's own copy
      // This allows multiple users to track the same repository independently

      // Create new repository for this user
      const { data: newRepo, error: createError } = await supabase
        .from('repositories')
        .insert({
          user_id: repoData.userId,
          name: repoData.name,
          full_name: repoData.fullName,
          url: repoData.url,
          description: repoData.description,
          language: repoData.language,
          stars: repoData.stars || 0,
          forks: repoData.forks || 0,
          is_private: repoData.isPrivate || false,
          github_id: repoData.githubId
        })
        .select('id')
        .single()

      if (createError) {
        console.error('Error creating repository:', createError)
        return null
      }

      return newRepo?.id || null
    } catch (error) {
      console.error('Error with repository:', error)
      return null
    }
  }

  const extractRepoInfo = (url: string) => {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      
      if (pathParts.length >= 2) {
        return {
          owner: pathParts[0],
          name: pathParts[1]
        }
      }
    } catch (error) {
      console.error('Invalid URL:', error)
    }
    
    return {
      owner: 'Unknown',
      name: url.split('/').pop() || 'Unknown Repository'
    }
  }

  const handleGenerateStory = async () => {
    if (!repoUrl.trim() || !user) return

    setIsGenerating(true)
    setProgress(0)
    setCurrentStory(null)
    setError(null)

    try {
      // Start progress
      setProgress(10)

      // Fetch real GitHub repository data
      console.log('Fetching GitHub repository data...')
      const githubData = await fetchGitHubRepository(repoUrl)
      
      if (!githubData) {
        throw new Error('Failed to fetch repository data')
      }

      setProgress(30)

      // Generate story using AI with real repository data
      const topLanguages = getTopLanguages(githubData.languages, 5)
      const timespan = formatTimespan(githubData.timespan.durationDays)
      
      const { text } = await blink.ai.generateText({
        prompt: `Analyze this GitHub repository and create a compelling story about its development journey:

Repository: ${githubData.repo.full_name}
Description: ${githubData.repo.description || 'No description provided'}
Primary Language: ${githubData.repo.language || 'Multiple languages'}
Stars: ${githubData.repo.stargazers_count}
Forks: ${githubData.repo.forks_count}
Contributors: ${githubData.contributors.length}
Total Commits (estimated): ${githubData.totalCommits}
Languages Used: ${topLanguages.join(', ')}
Active Development Period: ${timespan}
Created: ${new Date(githubData.repo.created_at).toLocaleDateString()}
Last Updated: ${new Date(githubData.repo.pushed_at || githubData.repo.updated_at).toLocaleDateString()}

Top Contributors:
${githubData.contributors.slice(0, 5).map(c => `- ${c.login} (${c.contributions} contributions)`).join('\n')}

Create an engaging narrative that includes:
- The project's origin story and motivation based on the description and early commits
- Key development milestones and challenges overcome
- The evolution of the codebase from ${githubData.repo.size} KB across ${topLanguages.length} languages
- Notable contributions from the ${githubData.contributors.length} developers involved
- The impact shown by ${githubData.repo.stargazers_count} stars and ${githubData.repo.forks_count} forks
- Future potential based on recent activity and open issues

Make it read like a captivating story about the human journey behind the code, using the real data to support the narrative. Keep it around 800-1000 words.`,
        maxTokens: 1200
      })

      setProgress(70)

      // Create repository data with real GitHub information
      const repositoryData: RepositoryInsert = {
        userId: user.id,
        name: githubData.repo.name,
        fullName: githubData.repo.full_name,
        url: repoUrl,
        description: githubData.repo.description || 'No description provided',
        language: githubData.repo.language || 'Multiple',
        stars: githubData.repo.stargazers_count,
        forks: githubData.repo.forks_count,
        isPrivate: githubData.repo.private,
        githubId: githubData.repo.id
      }

      // Find or create repository
      const repositoryId = await findOrCreateRepository(repositoryData)
      
      if (!repositoryId) {
        throw new Error('Failed to create or find repository')
      }

      setProgress(85)

      // Create story data with real insights
      const storyData: StoryInsert = {
        userId: user.id,
        title: `The Story of ${githubData.repo.name}`,
        content: text,
        repositoryId: repositoryId,
        insights: {
          totalCommits: githubData.totalCommits,
          contributors: githubData.contributors.length,
          languages: topLanguages,
          timespan: timespan
        }
      }

      // Save story to Supabase
      const { data: newStory, error: storyError } = await supabase
        .from('stories')
        .insert({
          user_id: storyData.userId,
          title: storyData.title,
          content: storyData.content,
          repository_id: storyData.repositoryId,
          insights: storyData.insights
        })
        .select(`
          *,
          repository:repositories(*)
        `)
        .single()

      if (storyError) {
        throw new Error('Failed to save story: ' + storyError.message)
      }

      // Convert to camelCase format
      const repository = newStory.repository ? {
        id: newStory.repository.id,
        userId: newStory.repository.user_id,
        name: newStory.repository.name,
        fullName: newStory.repository.full_name,
        url: newStory.repository.url,
        description: newStory.repository.description,
        language: newStory.repository.language,
        stars: newStory.repository.stars,
        forks: newStory.repository.forks,
        isPrivate: newStory.repository.is_private,
        githubId: newStory.repository.github_id,
        lastAnalyzedAt: newStory.repository.last_analyzed_at,
        createdAt: newStory.repository.created_at,
        updatedAt: newStory.repository.updated_at
      } : null

      const storyWithRepo = {
        id: newStory.id,
        userId: newStory.user_id,
        title: newStory.title,
        content: newStory.content,
        repositoryId: newStory.repository_id,
        insights: newStory.insights,
        createdAt: newStory.created_at,
        updatedAt: newStory.updated_at,
        repository
      }

      setCurrentStory(storyWithRepo)
      
      // Reload stories to include the new one
      await loadUserStories(user.id)
      
      setProgress(100)

    } catch (error) {
      console.error('Error generating story:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate story')
    } finally {
      setIsGenerating(false)
      setProgress(0)
    }
  }

  const exportStory = (story: Story, format: 'markdown' | 'text') => {
    const repoName = story.repository?.name || 'Unknown Repository'
    const repoUrl = story.repository?.url || ''
    
    const content = format === 'markdown' 
      ? `# ${story.title}\\n\\n${story.content}\\n\\n---\\n\\n**Repository:** ${repoUrl}\\n**Generated:** ${new Date(story.createdAt).toLocaleDateString()}`
      : `${story.title}\\n\\n${story.content}\\n\\nRepository: ${repoUrl}\\nGenerated: ${new Date(story.createdAt).toLocaleDateString()}`
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${repoName}-story.${format === 'markdown' ? 'md' : 'txt'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Github className="h-6 w-6" />
              GitHub Story Generator
            </CardTitle>
            <CardDescription>
              Sign in to start generating compelling stories from your repositories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => blink.auth.login()} 
              className="w-full"
            >
              Sign In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">GitHub Story Generator</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Welcome, {user.displayName || user.email}
              </span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => blink.auth.logout()}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {error && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Story Generator Form */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Generate Story
                </CardTitle>
                <CardDescription>
                  Enter a GitHub repository URL to generate an AI-powered story about its development journey
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="repo-url">Repository URL</Label>
                  <Input
                    id="repo-url"
                    placeholder="https://github.com/username/repository"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    disabled={isGenerating}
                  />
                </div>

                {isGenerating && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Analyzing repository...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="w-full" />
                  </div>
                )}

                <Button 
                  onClick={handleGenerateStory}
                  disabled={!repoUrl.trim() || isGenerating}
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Generating Story...
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4 mr-2" />
                      Generate Story
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Recent Stories */}
            {stories.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Recent Stories ({stories.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stories.slice(0, 5).map((story) => (
                      <div 
                        key={story.id}
                        className={`p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                          currentStory?.id === story.id ? 'bg-muted border-primary' : ''
                        }`}
                        onClick={() => setCurrentStory(story)}
                      >
                        <h4 className="font-medium text-sm">{story.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {story.repository?.name} • {new Date(story.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Story Display */}
          <div className="lg:col-span-2">
            {currentStory ? (
              <div className="space-y-6">
                {/* Repository Info */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <GitBranch className="h-5 w-5" />
                          {currentStory.repository?.name || 'Unknown Repository'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {currentStory.repository?.description}
                        </CardDescription>
                        {currentStory.repository?.url && (
                          <a 
                            href={currentStory.repository.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline mt-1 inline-block"
                          >
                            View Repository →
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportStory(currentStory, 'markdown')}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          MD
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportStory(currentStory, 'text')}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          TXT
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {currentStory.insights.totalCommits}
                        </div>
                        <div className="text-xs text-muted-foreground">Commits</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {currentStory.insights.contributors}
                        </div>
                        <div className="text-xs text-muted-foreground">Contributors</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {currentStory.repository?.stars || 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Stars</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {currentStory.insights.timespan}
                        </div>
                        <div className="text-xs text-muted-foreground">Active</div>
                      </div>
                    </div>
                    <Separator className="my-4" />
                    <div className="flex flex-wrap gap-2">
                      {currentStory.insights.languages.map((lang) => (
                        <Badge key={lang} variant="secondary">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Generated Story */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {currentStory.title}
                    </CardTitle>
                    <CardDescription>
                      Generated on {new Date(currentStory.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {currentStory.content}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="h-96 flex items-center justify-center">
                <div className="text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Story Selected</h3>
                  <p className="text-muted-foreground">
                    Generate a story from a GitHub repository to see it here
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App