require "set"
require "json"
require 'clamp'

# see https://github.com/mdub/clamp

def report_error file, line_num, message, content
  $stderr.puts "Error in #{file} at line #{line_num}"

  if content.empty?
    $stderr.puts "   #{message}"
  else
    $stderr.puts "   #{content}"
    $stderr.puts "   ^ #{message}"
  end
end

class Subtitle
  attr_accessor :texts, :id, :from, :to

  def initialize id
    @id = id
    @texts = []
  end
end

class SRTParser
  def load_file file
    valid = true

    content = []

    open(file, 'r') do |input|
      current = nil
      state = :expect_id

      input
        .each_with_index
        .lazy
        .each do |line, i|
          line.chomp!

          case state
          when :expect_id
            if line !~ /^\d+$/
              valid = false
              report_error file, i + 1, "Expecting subtitle id as a number", line
              break
            end

            current = Subtitle.new(line)

            state = :expect_timecode
          when :expect_timecode
            if line !~ /^\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d$/
              valid = false
              report_error file, i + 1, "Expecting timecode range (like '00:00:51,776 --> 00:00:54,442')", line
              break
            end
            
            from, to = line.split(" --> ")

            current.from = parseTimecode(from)
            current.to = parseTimecode(to)

            state = :expect_subtitles
          when :expect_subtitles
            if line == ""
              if current.texts.empty?
                valid = false
                report_error file, i + 1, "No text was provided", line
                break
              end

              content << current
              current = nil

              state = :expect_id
            else
              current.texts << line
            end
          end
      end 

      content << current if valid && current
    end

    [content, valid]
  end

  def parseTimecode(str)
    hours, minutes, seconds = str.split(":")
  
    hours.to_i * 3600.0 +
    minutes.to_i * 60.0 +
    seconds.gsub(",", ".").to_f
  end
end

class SRTWriter
  def save file, content
    File.open(file, "w") do |out|
      content.each do |e|
        out.puts e.id
        out.puts "#{toSMPTETimecode(e.from)} --> #{toSMPTETimecode(e.to)}"
        out.puts e.texts.join("\n")
        out.puts
      end
    end
  end

  def toSMPTETimecode(time)
    i = time.floor

    ms = "#{1000 + ((time - i) * 1000.0).round}"[1..3]
    sec = "#{100 + (i % 60)}"[1..-1]
    min = "#{100 + (i / 60.0).floor}"[1..2]

    "00:#{min}:#{sec},#{ms}"
  end
end

Clamp do
  banner %(
    Shift all timecodes of the SRT subtitle files by the given millisecondes offset.

    Make a backup of file.
  )

  option ["--no-backup"], :flag, "Do not create backup files."

  option ["-o", "--offset"], "OFFSET", "Offset in millis to apply", required: true do |s|
    Integer(s)
  end

  option ["-v", "--verbose"], :flag, "Run in verbose mode"

  parameter "srt-file ...", "Files to update" do |file|
    signal_usage_error "File not found: #{file}" unless File.exist?(file)

    file
  end

  def execute
    srt_file_list.each do |file|
      puts "Parsing file #{file}" if verbose?
      parser = SRTParser.new

      content, valid = parser.load_file(file)

      next unless valid

      puts "Processing file #{file}" if verbose?
      new_content = shift_timings(content)

      save(file, new_content)
    end
  end

  def shift_timings(data)
    seconds = offset / 1000.0

    puts "Applying offset of #{seconds} seconds" if verbose?

    new_data = data.map do |e|
      e.from += seconds
      e.to += seconds

      e
    end
  end

  def save(file, content)
    unless no_backup?
      backup_file = file + ".bak"
      File.rename(file, backup_file)
      puts "Create backup file '#{backup_file}'" if verbose?
    end

    SRTWriter.new.save(file, content)

    puts "Wrote file '#{file}'" if verbose?
  end
end
