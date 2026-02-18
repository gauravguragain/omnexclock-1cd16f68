import { useEffect, useState } from "react";
import { toAusLocaleString } from "@/lib/dateUtils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MessageSquare, Plus, Trash2, ThumbsUp, Heart, Smile } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { logAudit } from "@/lib/auditLog";

interface ForumPost {
  id: string;
  title: string;
  content: string;
  created_at: string;
  comment_count: number;
  reaction_counts: Record<string, number>;
}

interface Comment {
  id: string;
  employee_name: string;
  content: string;
  created_at: string;
}

export default function ForumPage() {
  const { isViewer } = useAuth();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("forum_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      // Fetch comment counts and reaction counts
      const postsWithCounts: ForumPost[] = [];
      for (const post of data) {
        const [{ count: commentCount }, { data: reactions }] = await Promise.all([
          supabase.from("forum_comments").select("*", { count: "exact", head: true }).eq("post_id", post.id),
          supabase.from("forum_reactions").select("reaction").eq("post_id", post.id),
        ]);
        const reactionCounts: Record<string, number> = {};
        reactions?.forEach(r => {
          reactionCounts[r.reaction] = (reactionCounts[r.reaction] || 0) + 1;
        });
        postsWithCounts.push({
          ...post,
          comment_count: commentCount || 0,
          reaction_counts: reactionCounts,
        });
      }
      setPosts(postsWithCounts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, []);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("forum_posts").insert({ title: title.trim(), content: content.trim() });
    if (error) {
      toast.error(error.message);
    } else {
      await logAudit("forum_post_create", { title: title.trim() });
      toast.success("Post published");
      setTitle("");
      setContent("");
      setCreateOpen(false);
      fetchPosts();
    }
    setSaving(false);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Delete this post and all its comments/reactions?")) return;
    const { error } = await supabase.from("forum_posts").delete().eq("id", postId);
    if (error) {
      toast.error(error.message);
    } else {
      await logAudit("forum_post_delete", { post_id: postId });
      toast.success("Post deleted");
      if (selectedPost?.id === postId) setSelectedPost(null);
      fetchPosts();
    }
  };

  const viewComments = async (post: ForumPost) => {
    setSelectedPost(post);
    setCommentsLoading(true);
    const { data } = await supabase
      .from("forum_comments")
      .select("*, employees(name)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments(
      (data || []).map((c: any) => ({
        id: c.id,
        employee_name: c.employees?.name || "Unknown",
        content: c.content,
        created_at: c.created_at,
      }))
    );
    setCommentsLoading(false);
  };

  const deleteComment = async (commentId: string) => {
    const { error } = await supabase.from("forum_comments").delete().eq("id", commentId);
    if (!error && selectedPost) {
      viewComments(selectedPost);
      fetchPosts();
    }
  };

  const REACTION_EMOJIS: Record<string, string> = { "👍": "👍", "❤️": "❤️", "😂": "😂", "🎉": "🎉" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Forum</h2>
          <p className="text-sm text-muted-foreground">Post announcements for employees to view in their portal</p>
        </div>
        {!isViewer && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Post
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Loading...</p>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No posts yet. Create your first announcement!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <Card key={post.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{post.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{post.content}</p>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {toAusLocaleString(new Date(post.created_at), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => viewComments(post)}>
                        <MessageSquare className="h-3.5 w-3.5" /> {post.comment_count} comments
                      </Button>
                      {Object.entries(post.reaction_counts).map(([emoji, count]) => (
                        <Badge key={emoji} variant="secondary" className="text-xs px-2 py-0.5">
                          {emoji} {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {!isViewer && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(post.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Post Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Announcement title..." value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea placeholder="Write your message..." value={content} onChange={e => setContent(e.target.value)} rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Publishing..." : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={(open) => { if (!open) setSelectedPost(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPost?.title} — Comments</DialogTitle>
          </DialogHeader>
          {commentsLoading ? (
            <p className="text-muted-foreground text-center py-6">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map(c => (
                <div key={c.id} className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{c.employee_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {toAusLocaleString(new Date(c.created_at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mt-1">{c.content}</p>
                  </div>
                  {!isViewer && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteComment(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
