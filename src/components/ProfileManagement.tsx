import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { User, Plus, Download, Upload, Trash2, Edit, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';

import type { DeviceStatus, ProfileConfig, ProfileManager } from '@/lib/types';

interface ProfileManagementProps {
  deviceStatus: DeviceStatus | null;
}

export function ProfileManagement({ deviceStatus }: ProfileManagementProps) {
  const [profileManager, setProfileManager] = useState<ProfileManager | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDescription, setNewProfileDescription] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Load profiles
  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoading(true);
      try {
        const manager: ProfileManager = await invoke('get_profiles');
        setProfileManager(manager);
      } catch (err) {
        console.error('Failed to load profiles:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfiles();
  }, []);

  const createProfile = async () => {
    if (!newProfileName.trim() || !deviceStatus) return;

    try {
      // Create a basic profile structure
      const newProfile: ProfileConfig = {
        id: crypto.randomUUID(),
        name: newProfileName.trim(),
        description: newProfileDescription.trim() || `Profile for ${deviceStatus.device_name}`,
        axes: Array.from({ length: deviceStatus.axes_count }, (_, i) => ({
          id: i,
          name: `Axis ${i + 1}`,
          min_value: -32768,
          max_value: 32767,
          center_value: 0,
          deadzone: 100,
          curve: 'linear',
          inverted: false,
        })),
        buttons: Array.from({ length: deviceStatus.buttons_count }, (_, i) => ({
          id: i,
          name: `Button ${i + 1}`,
          function: 'normal',
          enabled: true,
        })),
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      };

      await invoke('create_profile', { profile: newProfile });
      
      // Reload profiles
      const manager: ProfileManager = await invoke('get_profiles');
      setProfileManager(manager);

      // Clear form and close dialog
      setNewProfileName('');
      setNewProfileDescription('');
      setIsCreateDialogOpen(false);
    } catch (err) {
      console.error('Failed to create profile:', err);
    }
  };

  const setActiveProfile = async (profileId: string) => {
    try {
      await invoke('set_active_profile', { profileId });
      
      // Reload profiles to get updated active state
      const manager: ProfileManager = await invoke('get_profiles');
      setProfileManager(manager);
    } catch (err) {
      console.error('Failed to set active profile:', err);
    }
  };

  const deleteProfile = async (profileId: string) => {
    try {
      await invoke('delete_profile', { profileId });
      
      // Reload profiles
      const manager: ProfileManager = await invoke('get_profiles');
      setProfileManager(manager);
    } catch (err) {
      console.error('Failed to delete profile:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (!deviceStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">No device connected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Management Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Profile Management
              </CardTitle>
              <CardDescription>
                Create and manage configuration profiles for different use cases
              </CardDescription>
            </div>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Profile
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Profile</DialogTitle>
                  <DialogDescription>
                    Create a new configuration profile for your HOTAS device
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Profile Name</Label>
                    <Input
                      id="profile-name"
                      placeholder="e.g., Flight Simulator, Space Combat, etc."
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-description">Description (Optional)</Label>
                    <Input
                      id="profile-description"
                      placeholder="Brief description of this profile's purpose"
                      value={newProfileDescription}
                      onChange={(e) => setNewProfileDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createProfile} disabled={!newProfileName.trim()}>
                    Create Profile
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <span>Total Profiles: {profileManager?.profiles.length || 0}</span>
            {profileManager?.active_profile_id && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span>Active Profile: {
                  profileManager.profiles.find(p => p.id === profileManager.active_profile_id)?.name || 'Unknown'
                }</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {!profileManager || profileManager.profiles.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Profiles Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first configuration profile to get started
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Profile
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {profileManager.profiles.map((profile) => {
                  const isActive = profileManager.active_profile_id === profile.id;
                  
                  return (
                    <Card key={profile.id} className={`p-4 ${isActive ? 'border-primary bg-primary/5' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium truncate">{profile.name}</h4>
                            {isActive && (
                              <Badge variant="default" className="bg-primary">
                                <Star className="w-3 h-3 mr-1" />
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {profile.description}
                          </p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                            <span>{profile.axes.length} axes</span>
                            <span>{profile.buttons.length} buttons</span>
                            <span>Created {formatDate(profile.created_at)}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 ml-4">
                          {!isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActiveProfile(profile.id)}
                            >
                              <Star className="w-3 h-3 mr-1" />
                              Activate
                            </Button>
                          )}
                          
                          <Button
                            size="sm"
                            variant="outline"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteProfile(profile.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Import/Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import & Export</CardTitle>
          <CardDescription>
            Backup and share your configuration profiles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Import Profile
            </Button>
            <Button variant="outline" disabled={!profileManager?.profiles.length}>
              <Download className="w-4 h-4 mr-2" />
              Export All Profiles
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Import/export functionality coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}