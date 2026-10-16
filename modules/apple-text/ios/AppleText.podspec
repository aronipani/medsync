Pod::Spec.new do |s|
  s.name           = 'AppleText'
  s.version        = '1.0.0'
  s.summary        = 'On-device text reading with Apple Vision for MedSync'
  s.description    = 'Reads printed text lines with VNRecognizeTextRequest and returns them with upright pixel positions.'
  s.author         = 'MedSync'
  s.homepage       = 'https://github.com/aronipani/medsync'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/aronipani/medsync.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Vision', 'ImageIO'
  s.source_files   = '**/*.{h,m,swift}'
end
